"""Document-scoped tools, evidence registry and an explicit bound on tool context."""

import json

from pydantic import ValidationError

from app.agent_tools import ToolResult
from app.comparison_schemas import DocumentArgs, PassageArgs, SearchDocumentArgs, ComparisonSource
from app.comparison_store import ComparisonPair
from app.retrieval import SearchHit
from app.service import Document, RAGService

COMPARISON_TOOL_SPECS = {
    "list_document_sections": (
        DocumentArgs,
        "Toon een paginagebaseerd overzicht met passage-ID's en korte previews. Er worden geen "
        "sectietitels geraden. Previews zijn geen volledige bewijsbronnen. Grote overzichten zijn afgekapt.",
    ),
    "search_document": (
        SearchDocumentArgs,
        "Doorzoek uitsluitend document_id op een onderwerp. Geef relevante passages met tekst, "
        "documentmetadata en reference_id. Geen hits bewijst niet dat een regel ontbreekt.",
    ),
    "get_document_passage": (
        PassageArgs,
        "Lees een volledige passage uit het opgegeven document ter controle. Gebruik passage_id "
        "of reference_id uit een eerder overzicht/zoekresultaat. Kan geen andere bestanden lezen.",
    ),
}


class ComparisonTools:
    def __init__(self, rag: RAGService, pair: ComparisonPair) -> None:
        self.rag, self.pair = rag, pair
        self.documents = {
            str(pair.document_a.id): pair.document_a,
            str(pair.document_b.id): pair.document_b,
        }
        self.retrieved: dict[str, ComparisonSource] = {}
        self.context_chars = 0

    def label_for(self, document_id: object) -> str | None:
        return (
            "A"
            if document_id == str(self.pair.document_a.id)
            else ("B" if document_id == str(self.pair.document_b.id) else None)
        )

    @staticmethod
    def metadata(document: Document) -> dict:
        return {
            "document_id": str(document.id),
            "filename": document.filename,
            "page_count": document.page_count,
            "passage_count": len(document.index.chunks),
        }

    @staticmethod
    def source(document: Document, hit: SearchHit) -> ComparisonSource:
        return ComparisonSource(
            document_id=document.id,
            filename=document.filename,
            chunk_id=hit.chunk.id,
            reference_id=f"{document.id}:{hit.chunk.id}",
            page=hit.chunk.page,
            text=hit.chunk.text,
            score=hit.score,
        )

    def dispatch(self, name: str, arguments: dict) -> ToolResult:
        if name not in COMPARISON_TOOL_SPECS:
            return ToolResult("blocked", "Deze tool is niet toegestaan.")
        try:
            args = COMPARISON_TOOL_SPECS[name][0].model_validate(arguments)
        except ValidationError:
            return ToolResult("error", "Ongeldige document-ID, zoekvraag, passage-ID of top_k.")
        document = self.documents.get(args.document_id)
        if document is None:
            return ToolResult("blocked", "Dit document hoort niet bij de huidige vergelijking.")
        result = self._dispatch(name, args, document)
        size = len(json.dumps(result.payload(), ensure_ascii=False))
        if self.context_chars + size > self.rag.settings.comparison_max_context_chars:
            return ToolResult(
                "blocked", "Het contextbudget is bereikt; de vergelijking blijft onvolledig."
            )
        self.context_chars += size
        # Only full passages actually sent to the model count as evidence, never overview previews.
        for source in result.data.get("sources", []):
            parsed = ComparisonSource.model_validate(source)
            self.retrieved[parsed.reference_id] = parsed
        return result

    def _dispatch(self, name: str, args, document: Document) -> ToolResult:
        meta = self.metadata(document)
        if name == "list_document_sections":
            chunks = document.index.chunks
            return ToolResult(
                "success",
                "Paginagebaseerd overzicht opgehaald; geen sectietitels afgeleid.",
                {
                    "document": meta,
                    "structure_kind": "pages",
                    "truncated": len(chunks) > 80,
                    "omitted_passages": max(0, len(chunks) - 80),
                    "passages": [
                        {
                            "passage_id": c.id,
                            "reference_id": f"{document.id}:{c.id}",
                            "page": c.page,
                            "preview": c.text[:160],
                        }
                        for c in chunks[:80]
                    ],
                },
            )
        if name == "search_document":
            hits = self.rag.search_in(document, args.query, top_k=args.top_k)
        else:
            passage_id = args.passage_id
            if ":" in passage_id:
                doc_id, passage_id = passage_id.split(":", 1)
                if doc_id != str(document.id):
                    return ToolResult(
                        "blocked", "De passageverwijzing hoort bij een ander document."
                    )
            chunk = next((c for c in document.index.chunks if c.id == passage_id), None)
            if chunk is None:
                return ToolResult("not_found", "Deze passage is niet gevonden in dit document.")
            # Direct lookup has no similarity score; zero is a placeholder, never a confidence value.
            hits = [SearchHit(chunk=chunk, score=0.0)]
        sources = [self.source(document, hit).model_dump(mode="json") for hit in hits]
        return ToolResult(
            "success" if sources else "not_found",
            f"{len(sources)} volledige passage(s) opgehaald."
            if sources
            else "Geen relevante passages gevonden. Dit bewijst niet dat het onderwerp ontbreekt.",
            {"document": meta, "sources": sources},
        )
