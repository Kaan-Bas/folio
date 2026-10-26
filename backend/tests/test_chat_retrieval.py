from unittest.mock import Mock
from uuid import UUID

import numpy as np
import pytest
from conftest import make_pdf
from fastapi.testclient import TestClient

from app.chat_retrieval import select_chat_context
from app.chunking import Chunk
from app.llm import GeneratedAnswer
from app.main import create_app
from app.retrieval import SearchHit, VectorIndex


def hit(chunk_id, page, text, score=0.8):
    return SearchHit(Chunk(chunk_id, page, text), score)


def test_literal_purpose_beats_a_high_scoring_generic_footer():
    hits = [
        hit("p2-c0", 2, "INTERN | FICTIEF VOORBEELDDOCUMENT | Pagina 2", 0.95),
        hit("p1-c0", 1, "Doel: afspraken voor hybride werken vastleggen.", 0.75),
    ]
    result = select_chat_context(
        "Wat is het doel van dit document?",
        hits,
        top_k=1,
        min_similarity=0.2,
    )
    assert [h.chunk.id for h in result] == ["p1-c0"]
    assert result[0].score == 0.75


def test_adjacent_fragments_keep_the_weekly_limit_and_its_conditions():
    hits = [
        hit("p1-c1", 1, "Thuiswerkdagen worden vooraf geregistreerd.", 0.95),
        hit("p2-c0", 2, "Bereikbaarheid tussen negen en vijf.", 0.8),
        hit("p1-c0", 1, "Maximaal 3 dagen per week thuiswerken.", 0.7),
        hit("p1-c2", 1, "Goedkeuring door de leidinggevende is nodig.", 0.6),
    ]
    result = select_chat_context("Thuiswerkdagen registreren", hits, top_k=1, min_similarity=0.2)
    assert [h.chunk.id for h in result] == ["p1-c0", "p1-c1", "p1-c2"]
    assert [h.chunk.page for h in result] == [1, 1, 1]
    assert result[0].chunk.text == "Maximaal 3 dagen per week thuiswerken."


def test_generic_summary_gets_the_introduction_instead_of_only_footers():
    hits = [
        hit("p3-c1", 3, "Samen de afspraken bespreken. INTERN | Versie 2026 | Pagina 3", 0.9),
        hit("p3-c0", 3, "De vergoeding is 3,25 euro per dag.", 0.8),
        hit("p1-c0", 1, "Thuiswerkbeleid. Doel en reikwijdte.", 0.7),
        hit("p1-c1", 1, "Maximaal 3 thuiswerkdagen per week.", 0.6),
    ]
    result = select_chat_context("Vat het document samen.", hits, top_k=1, min_similarity=0.2)
    assert {h.chunk.id for h in result} == {"p1-c0", "p1-c1", "p3-c0", "p3-c1"}


def test_literal_retrieval_can_find_evidence_below_the_cosine_threshold():
    result = select_chat_context(
        "Wat is projectcode ABC123?",
        [hit("p1-c0", 1, "Projectcode ABC123.", 0.1)],
        top_k=1,
        min_similarity=0.8,
    )
    assert result[0].chunk.text == "Projectcode ABC123."
    assert result[0].score == 0.1


@pytest.mark.parametrize(
    "question",
    [
        "Vat het document samen, inclusief het weekmaximum en de vergoeding.",
        "Geef een samenvatting met de vergoeding.",
        "Summarize this document including allowances.",
    ],
)
def test_small_document_overview_covers_all_sections_even_with_specific_search_terms(question):
    hits = [
        hit("p3-c0", 3, "Vergoeding en allowances: 3,25 euro.", 0.95),
        hit("p2-c0", 2, "Binnen het geldende weekmaximum.", 0.9),
        hit("p1-c0", 1, "Maximaal 3 thuiswerkdagen per week.", 0.1),
    ]
    result = select_chat_context(question, hits, top_k=1, min_similarity=0.2)
    assert [h.chunk.page for h in result] == [1, 2, 3]


def test_a_long_summary_still_respects_the_context_budget():
    hits = [hit(f"p{i}-c0", i, "abc " * 100, 0.9) for i in range(1, 21)]
    result = select_chat_context(
        "Vat het document samen.", hits, top_k=4, min_similarity=0.2, max_chars=1000
    )
    assert sum(len(h.chunk.text) for h in result) <= 1000
    assert result[0].chunk.page == 1


@pytest.mark.parametrize(
    "question", ["Welke kleur heeft een fiets?", "Wat is het doel van dit document?"]
)
def test_no_semantic_or_literal_evidence_does_not_force_irrelevant_context(question):
    result = select_chat_context(
        question,
        [hit("p1-c0", 1, "De trein rijdt.", 0.0)],
        top_k=4,
        min_similarity=0.2,
    )
    assert result == []


def test_context_budget_deduplicates_and_keeps_whole_original_chunks():
    hits = [hit(f"p1-c{i}", 1, f"thuiswerken {i} " + "x" * 120, 0.9 - i * 0.01) for i in range(12)]
    result = select_chat_context("thuiswerken", hits, top_k=12, min_similarity=0.2, max_chars=500)
    assert result
    assert sum(len(h.chunk.text) for h in result) <= 500
    assert len({h.chunk.id for h in result}) == len(result)
    assert all(h in hits for h in result)


def test_page_local_neighbors_do_not_pull_the_last_chunk_from_another_page():
    hits = [
        hit("p1-c9", 1, "Vertrouwelijke andere paragraaf.", 0.0),
        hit("p2-c0", 2, "Tarieven: 25 euro.", 1.0),
    ]
    result = select_chat_context("Wat zijn de tarieven?", hits, top_k=1, min_similarity=0.2)
    assert [h.chunk.id for h in result] == ["p2-c0"]


def test_chunk_order_is_numeric_and_retains_physical_page_numbers():
    hits = [
        hit("p3-c10", 3, "Kantoor op vrijdag.", 0.5),
        hit("p3-c9", 3, "Vier werkdagen.", 0.8),
        hit("p3-c11", 3, "Overleg nodig.", 0.4),
    ]
    result = select_chat_context("Vier werkdagen", hits, top_k=1, min_similarity=0.2)
    assert [h.chunk.id for h in result] == ["p3-c9", "p3-c10"]


def test_chat_recovers_a_missed_rule_but_shared_agent_search_stays_dense(settings, embedder):
    generator = Mock()
    generator.generate.return_value = GeneratedAnswer(
        answer="Maximaal 3 dagen.", cited_chunk_ids=["p1-c0"], sufficient_context=True
    )
    with TestClient(create_app(settings, embedder=embedder, generator=generator)) as client:
        uploaded = client.post(
            "/api/documents",
            files={
                "file": (
                    "policy.pdf",
                    make_pdf("Maximaal 3 dagen per week thuiswerken."),
                    "application/pdf",
                )
            },
        ).json()
        rag = client.app.state.rag
        document = rag.store.get(UUID(uploaded["document_id"]))
        # A relevant opening chunk ranks below all four dense footer fragments.
        chunks = [
            Chunk("p1-c0", 1, "Doel en reikwijdte: maximaal 3 dagen per week thuiswerken."),
            *[Chunk(f"p{i}-c0", i, f"INTERN | Versie 2026 | Pagina {i}") for i in range(2, 6)],
        ]
        vectors = np.asarray([[1, 0], *([[0, 1]] * 4)], dtype=np.float32)
        replacement = type(document)(
            document.id, VectorIndex(chunks, vectors), document.filename, 5
        )
        rag.store.install(replacement)
        before = rag.search(document.id, "Wat is het doel van dit document?")
        assert all(h.chunk.page != 1 for h in before)
        result = client.post(
            "/api/questions",
            json={"document_id": str(document.id), "question": "Wat is het doel van dit document?"},
        ).json()
        assert result["insufficient_context"] is False, result
        assert result["sources"][0]["page"] == 1
        assert any(h.chunk.id == "p1-c0" for h in generator.generate.call_args.args[1])
        assert rag.search(document.id, "Wat is het doel van dit document?") == before
