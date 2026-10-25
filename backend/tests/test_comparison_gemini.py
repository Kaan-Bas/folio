"""Exercise the installed SDK's real serializers without external API requests."""

import json

import httpx
from fastapi.testclient import TestClient
from google import genai

from app.config import Settings
from app.main import create_app
from conftest import make_pdf


def test_comparison_sdk_selects_only_comparison_tools_and_preserves_document_refs(
    monkeypatch, embedder
):
    payloads = []

    def provider(request):
        data = json.loads(request.content)
        payloads.append(data)
        declarations = data["tools"][0]["functionDeclarations"]
        assert {t["name"] for t in declarations} == {
            "list_document_sections",
            "search_document",
            "get_document_passage",
        }
        assert "ONBETROUWBARE DATA" in data["systemInstruction"]["parts"][0]["text"]
        assert "unit-test-key" not in request.content.decode()
        initial = json.loads(data["contents"][0]["parts"][0]["text"])
        a, b = initial["document_a"]["document_id"], initial["document_b"]["document_id"]
        if len(payloads) == 1:
            parts = [
                {
                    "functionCall": {
                        "name": "search_document",
                        "id": label,
                        "args": {
                            "document_id": doc,
                            "query": "retourtermijn",
                            "top_k": 4,
                        },
                    },
                    "thoughtSignature": "c2lnbmF0dXJl",
                }
                for label, doc in (("A", a), ("B", b))
            ]
        else:
            assert data["contents"][1]["parts"][0]["thoughtSignature"] == "c2lnbmF0dXJl"
            responses = data["contents"][2]["parts"]
            assert [part["functionResponse"]["id"] for part in responses] == ["A", "B"]
            sources = [
                part["functionResponse"]["response"]["untrusted_tool_result"]["data"]["sources"][0]
                for part in responses
            ]
            assert [s["document_id"] for s in sources] == [a, b]
            parts = [
                {
                    "text": json.dumps(
                        {
                            "summary": "De termijn is gewijzigd.",
                            "findings": [
                                {
                                    "topic": "Retourtermijn",
                                    "change_type": "modified",
                                    "old_situation": "14 dagen",
                                    "new_situation": "30 dagen",
                                    "explanation": "Meer dagen voor een retouraanvraag.",
                                    "source_ids_a": [sources[0]["reference_id"]],
                                    "source_ids_b": [sources[1]["reference_id"]],
                                    "insufficient_evidence": False,
                                }
                            ],
                        }
                    )
                }
            ]
        return httpx.Response(
            200,
            json={
                "candidates": [
                    {"finishReason": "STOP", "content": {"role": "model", "parts": parts}}
                ]
            },
        )

    real_client = genai.Client

    def sdk_client(**options):
        options["http_options"].httpx_client = httpx.Client(transport=httpx.MockTransport(provider))
        return real_client(**options)

    monkeypatch.setattr("app.gemini.genai.Client", sdk_client)
    with TestClient(
        create_app(Settings(_env_file=None, gemini_api_key="unit-test-key"), embedder=embedder)
    ) as client:
        pair = client.post(
            "/api/comparisons/documents",
            files={
                "document_a": ("old.pdf", make_pdf("Retourtermijn 14 dagen."), "application/pdf"),
                "document_b": (
                    "new.pdf",
                    make_pdf("", "Retourtermijn 30 dagen."),
                    "application/pdf",
                ),
            },
        ).json()
        assert payloads == []
        result = client.post(
            "/api/comparisons",
            json={
                "comparison_id": pair["comparison_id"],
                "document_a_id": pair["document_a"]["document_id"],
                "document_b_id": pair["document_b"]["document_id"],
                "instruction": "Vergelijk de retourtermijn.",
            },
        ).json()
    assert result["status"] == "completed", result
    assert result["findings"][0]["sources_b"][0]["page"] == 2
    assert len(payloads) == 2
