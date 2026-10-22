"""Validate manual function calling with the real installed SDK and mocked HTTP only."""

import json
from unittest.mock import MagicMock

import httpx
import pytest
from fastapi.testclient import TestClient
from google import genai
from google.genai import types

from app.config import Settings
from app.errors import AppError
from app.gemini import GeminiAgentModel
from app.main import create_app
from conftest import make_pdf


def test_real_sdk_round_trip_preserves_call_id_signature_and_policy_page(monkeypatch, embedder):
    payloads = []
    http_options = []

    def provider(request):
        payload = json.loads(request.content)
        payloads.append(payload)
        assert "unit-test-key" not in request.content.decode()
        declarations = payload["tools"][0]["functionDeclarations"]
        assert {item["name"] for item in declarations} == {
            "search_policy",
            "get_order_details",
            "calculate_days_between",
        }
        assert "ONBETROUWBARE DATA" in payload["systemInstruction"]["parts"][0]["text"]
        assert payload["toolConfig"]["functionCallingConfig"]["mode"] == "AUTO"
        if len(payloads) == 1:
            parts = [
                {
                    "functionCall": {
                        "id": "search-123",
                        "name": "search_policy",
                        "args": {"query": "retourbeleid"},
                    },
                    "thoughtSignature": "c2lnbmF0dXJl",
                }
            ]
        else:
            assert payload["contents"][1]["parts"][0]["thoughtSignature"] == "c2lnbmF0dXJl"
            result = payload["contents"][2]["parts"][0]["functionResponse"]
            assert result["id"] == "search-123"
            assert result["name"] == "search_policy"
            context = result["response"]["untrusted_tool_result"]["data"]
            assert context["document"]["filename"] == "refund_policy.pdf"
            assert context["fragments"][0]["page"] == 3
            parts = [
                {
                    "text": json.dumps(
                        {
                            "answer": "Conceptadvies: de retourtermijn is 30 dagen na levering.",
                            "cited_chunk_ids": ["p3-c0"],
                            "sufficient_context": True,
                        }
                    )
                }
            ]
        return httpx.Response(
            200,
            json={
                "candidates": [
                    {
                        "content": {"role": "model", "parts": parts},
                        "finishReason": "STOP",
                    }
                ]
            },
        )

    original_client = genai.Client

    def sdk_client(**options):
        http_options.append(options["http_options"])
        options["http_options"].httpx_client = httpx.Client(transport=httpx.MockTransport(provider))
        return original_client(**options)

    monkeypatch.setattr("app.gemini.genai.Client", sdk_client)
    settings = Settings(_env_file=None, gemini_api_key="unit-test-key")
    with TestClient(create_app(settings, embedder=embedder)) as client:
        uploaded = client.post(
            "/api/documents",
            files={
                "file": (
                    "refund_policy.pdf",
                    make_pdf("", "", "Retourtermijn: 30 dagen na levering."),
                    "application/pdf",
                ),
            },
        ).json()
        assert payloads == []
        result = client.post(
            "/api/agent",
            json={
                "document_id": uploaded["document_id"],
                "instruction": "Wat is de retourtermijn?",
            },
        ).json()
    assert result["status"] == "completed", result
    assert result["sources"][0]["page"] == 3
    assert len(payloads) == 2
    assert all(options.retry_options.attempts == 1 for options in http_options)
    assert all(0 < options.timeout <= 45000 for options in http_options)


def test_sdk_automatic_dispatch_is_disabled_and_budget_zero_disables_tools(monkeypatch):
    client = MagicMock()
    constructor = MagicMock()
    constructor.return_value.__enter__.return_value = client
    client.models.generate_content.return_value = types.GenerateContentResponse(
        candidates=[
            types.Candidate(
                content=types.Content(role="model", parts=[types.Part.from_text(text="{}")]),
                finish_reason="STOP",
            ),
        ]
    )
    monkeypatch.setattr("app.gemini.genai.Client", constructor)
    GeminiAgentModel(Settings(_env_file=None, gemini_api_key="unit-test-key")).next_turn(
        [],
        remaining_calls=0,
        timeout_seconds=7,
    )
    config = client.models.generate_content.call_args.kwargs["config"]
    assert config.automatic_function_calling.disable is True
    assert config.tool_config.function_calling_config.mode == "NONE"
    assert constructor.call_args.kwargs["http_options"].timeout == 7000


@pytest.mark.parametrize("reason", ["SAFETY", "MAX_TOKENS"])
def test_incomplete_agent_model_turn_is_rejected(monkeypatch, reason):
    client = MagicMock()
    constructor = MagicMock()
    constructor.return_value.__enter__.return_value = client
    client.models.generate_content.return_value = types.GenerateContentResponse(
        candidates=[
            types.Candidate(content=types.Content(role="model", parts=[]), finish_reason=reason),
        ]
    )
    monkeypatch.setattr("app.gemini.genai.Client", constructor)
    with pytest.raises(AppError) as failure:
        GeminiAgentModel(Settings(_env_file=None, gemini_api_key="unit-test-key")).next_turn(
            [],
            remaining_calls=5,
            timeout_seconds=7,
        )
    assert failure.value.code == "incomplete_answer"
