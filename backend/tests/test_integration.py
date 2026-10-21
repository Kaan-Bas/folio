"""Use the real Gemini SDK and FAISS; replace HTTP and local model inference only."""

import json
from unittest.mock import Mock

import httpx
import numpy as np
from fastapi.testclient import TestClient
from google import genai

from app.config import Settings
from app.main import create_app
from conftest import make_pdf


def test_full_pipeline_with_local_embeddings_and_real_gemini_sdk(monkeypatch):
    calls: list[dict] = []
    model = Mock()
    model.encode.side_effect = lambda texts, **_options: np.asarray(
        [[1.0, 0.0] if "fiets" in text else [0.0, 1.0] for text in texts], dtype=np.float32
    )
    loader = Mock(return_value=model)
    monkeypatch.setattr("app.embeddings.load_model", loader)

    def provider(request: httpx.Request) -> httpx.Response:
        assert request.url.host == "generativelanguage.googleapis.com"
        assert request.url.path.endswith("/models/gemini-3.5-flash-lite:generateContent")
        payload = json.loads(request.content)
        calls.append(payload)
        context = json.loads(payload["contents"][0]["parts"][0]["text"])
        assert context["question"] == "Welke kleur heeft de fiets?"
        assert context["untrusted_pdf_fragments"] == [
            {"id": "p3-c0", "page": 3, "text": "De fiets is blauw."},
        ]
        assert "onbetrouwbare" in payload["systemInstruction"]["parts"][0]["text"]
        assert payload["generationConfig"]["responseMimeType"] == "application/json"
        assert "unit-test-key" not in request.content.decode()
        return httpx.Response(
            200,
            json={
                "candidates": [
                    {
                        "content": {
                            "role": "model",
                            "parts": [
                                {
                                    "text": json.dumps(
                                        {
                                            "answer": "De fiets is blauw.",
                                            "cited_chunk_ids": ["p3-c0"],
                                            "sufficient_context": True,
                                        }
                                    )
                                }
                            ],
                        },
                        "finishReason": "STOP",
                    }
                ]
            },
        )

    real_client = genai.Client

    def sdk_client(**options):
        options["http_options"].httpx_client = httpx.Client(transport=httpx.MockTransport(provider))
        return real_client(**options)

    monkeypatch.setattr("app.gemini.genai.Client", sdk_client)
    settings = Settings(_env_file=None, gemini_api_key="unit-test-key")
    with TestClient(create_app(settings)) as client:
        uploaded = client.post(
            "/api/documents",
            files={
                "file": (
                    "test.pdf",
                    make_pdf("De trein is geel.", "", "De fiets is blauw."),
                    "application/pdf",
                )
            },
        )
        assert uploaded.status_code == 201
        assert uploaded.json()["page_count"] == 3
        assert calls == []  # Uploading/embedding never contacts Gemini.
        response = client.post(
            "/api/questions",
            json={
                "document_id": uploaded.json()["document_id"],
                "question": "Welke kleur heeft de fiets?",
            },
        )
    assert response.status_code == 200
    assert response.json()["sources"] == [
        {
            "chunk_id": "p3-c0",
            "page": 3,
            "text": "De fiets is blauw.",
            "score": 1.0,
        }
    ]
    assert model.encode.call_args_list[0].args[0] == [
        "passage: De trein is geel.",
        "passage: De fiets is blauw.",
    ]
    assert model.encode.call_args_list[1].args[0] == ["query: Welke kleur heeft de fiets?"]
    loader.assert_called_once()
    assert len(calls) == 1
