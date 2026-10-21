from unittest.mock import Mock
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.errors import AppError
from app.llm import GeneratedAnswer
from app.main import create_app
from app.schemas import QuestionRequest
from conftest import make_pdf


def upload(client, data=None, name="voorbeeld.pdf", mime="application/pdf"):
    return client.post(
        "/api/documents",
        files={"file": (name, make_pdf("De fiets is blauw.") if data is None else data, mime)},
    )


def ask(client, document_id, question="Welke kleur heeft de fiets?"):
    return client.post("/api/questions", json={"document_id": document_id, "question": question})


def test_upload_and_question_only_send_retrieved_context(client, generator, embedder):
    response = upload(client, make_pdf("De fiets is blauw.", "", "De trein is geel."))
    assert response.status_code == 201
    document = response.json()
    assert document["page_count"] == 3
    assert document["text_page_count"] == 2
    answer = ask(client, document["document_id"])
    assert answer.status_code == 200
    assert answer.json()["insufficient_context"] is False
    assert answer.json()["sources"][0]["page"] == 1
    question, hits = generator.generate.call_args.args
    assert question == "Welke kleur heeft de fiets?"
    assert [hit.chunk.page for hit in hits] == [1]
    assert embedder.calls[-1] == [question]


@pytest.mark.parametrize(
    ("data", "name", "mime", "status", "code"),
    [
        (b"text", "file.txt", "text/plain", 415, "unsupported_file"),
        (b"text", "file.pdf", "image/png", 415, "unsupported_file"),
        (b"text", "file.pdf", "application/pdf", 400, "invalid_pdf"),
        (b"", "file.pdf", "application/pdf", 400, "empty_file"),
        (make_pdf(""), "file.pdf", "application/pdf", 400, "empty_pdf"),
    ],
)
def test_upload_validation(client, data, name, mime, status, code):
    response = upload(client, data, name, mime)
    assert response.status_code == status
    assert response.json()["error"]["code"] == code


def test_upload_size_limit(settings, embedder, generator):
    settings.max_upload_mb = 1
    with TestClient(create_app(settings, embedder=embedder, generator=generator)) as client:
        response = upload(client, b"%PDF-" + b"x" * 1024 * 1024)
    assert response.status_code == 413
    assert response.json()["error"]["code"] == "file_too_large"
    assert embedder.calls == []


def test_question_without_document(client):
    assert ask(client, str(uuid4())).status_code == 404


@pytest.mark.parametrize("question", ["", "   ", "a" * 2001])
def test_invalid_questions(client, question):
    response = ask(client, str(uuid4()), question)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"


def test_invalid_uuid_and_missing_file(client):
    assert ask(client, "not-an-id").status_code == 422
    assert client.post("/api/documents").status_code == 422


def test_new_upload_rejects_old_id_and_replaces_context(client, generator):
    old = upload(client).json()["document_id"]
    new = upload(client, make_pdf("De trein is geel.")).json()["document_id"]
    assert old != new
    assert ask(client, old).status_code == 409
    assert ask(client, new, "Wat staat er over de trein?").status_code == 200
    assert generator.generate.call_args.args[1][0].chunk.text == "De trein is geel."


def test_failed_replacement_does_not_reuse_old_index(client):
    old = upload(client).json()["document_id"]
    assert upload(client, b"broken").status_code == 400
    assert ask(client, old).status_code == 404


def test_no_relevant_context_skips_llm(client, generator):
    document_id = upload(client, make_pdf("De trein is geel.")).json()["document_id"]
    response = ask(client, document_id)
    assert response.json()["insufficient_context"] is True
    assert response.json()["sources"] == []
    generator.generate.assert_not_called()


def test_llm_can_report_insufficient_evidence(client, generator):
    document_id = upload(client).json()["document_id"]
    generator.generate.return_value = GeneratedAnswer(
        answer="unused", cited_chunk_ids=[], sufficient_context=False
    )
    generator.generate.side_effect = None
    response = ask(client, document_id)
    assert response.json()["insufficient_context"] is True
    assert response.json()["sources"] == []


@pytest.mark.parametrize("citations", [["invented"], []])
def test_hallucinated_or_missing_citations_are_rejected(client, generator, citations):
    document_id = upload(client).json()["document_id"]
    generator.generate.side_effect = None
    generator.generate.return_value = GeneratedAnswer(
        answer="Answer", cited_chunk_ids=citations, sufficient_context=True
    )
    response = ask(client, document_id)
    assert response.status_code == 502
    assert response.json()["error"]["code"] == "invalid_citations"


def test_missing_key_only_blocks_answers_not_local_indexing(settings, embedder):
    with TestClient(create_app(settings, embedder=embedder)) as client:
        health = client.get("/api/health").json()
        assert health["configured"] is False
        assert health["max_question_chars"] == 2000
        document = upload(client)
        assert document.status_code == 201
        response = ask(client, document.json()["document_id"])
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "missing_api_key"
    assert "De LLM is nog niet ingesteld." in response.json()["error"]["message"]


def test_provider_error_does_not_install_an_index(settings, generator):
    embedder = Mock()
    embedder.embed.side_effect = AppError(502, "provider_unavailable", "Provider onbereikbaar.")
    with TestClient(create_app(settings, embedder=embedder, generator=generator)) as client:
        assert upload(client).status_code == 502
        assert ask(client, str(uuid4())).status_code == 404


def test_cors_allows_only_configured_origins(client):
    allowed = client.options(
        "/api/questions",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "Content-Type",
        },
    )
    assert allowed.status_code == 200
    assert allowed.headers["access-control-allow-origin"] == "http://localhost:5173"
    denied = client.options(
        "/api/questions",
        headers={"Origin": "https://untrusted.example", "Access-Control-Request-Method": "POST"},
    )
    assert denied.status_code == 400
    assert "access-control-allow-origin" not in denied.headers


def test_late_upload_cannot_replace_newer_document(client):
    service = client.app.state.rag
    first = service.store.begin_upload()
    second = service.store.begin_upload()
    service.ingest(make_pdf("De trein is geel."), "new.pdf", second)
    with pytest.raises(AppError) as error:
        service.ingest(make_pdf("De fiets is blauw."), "old.pdf", first)
    assert error.value.code == "upload_superseded"
    assert service.store.get(second).id == second


def test_replacement_during_answer_rejects_stale_response(client, generator):
    document_id = upload(client).json()["document_id"]
    service = client.app.state.rag

    def replace_during_answer(_question, hits):
        service.store.begin_upload()
        return GeneratedAnswer(
            answer="Oud", cited_chunk_ids=[hits[0].chunk.id], sufficient_context=True
        )

    generator.generate.side_effect = replace_during_answer
    assert ask(client, document_id).status_code == 404


def test_chunk_limit_prevents_embedding_cost(settings, embedder, generator):
    settings.max_chunks = 1
    with TestClient(create_app(settings, embedder=embedder, generator=generator)) as client:
        response = upload(client, make_pdf("De fiets", "De trein"))
    assert response.status_code == 413
    assert embedder.calls == []


def test_question_is_trimmed():
    request = QuestionRequest(document_id=uuid4(), question="  Wat?  ")
    assert request.question == "Wat?"
