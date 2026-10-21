from dataclasses import dataclass
from threading import Lock
from uuid import UUID, uuid4

from app.chunking import chunk_pages
from app.config import Settings
from app.embeddings import Embedder
from app.errors import AppError
from app.llm import AnswerGenerator
from app.pdf import extract_pdf
from app.retrieval import VectorIndex
from app.schemas import QuestionRequest, QuestionResponse, Source, UploadResponse

INSUFFICIENT_CONTEXT = "Ik kan deze vraag niet beantwoorden op basis van de beschikbare PDF-fragmenten. Er is onvoldoende informatie in de gevonden context."


@dataclass(frozen=True)
class Document:
    id: UUID
    index: VectorIndex


class DocumentStore:
    """Exactly one document per process. A revision prevents late uploads from winning."""

    def __init__(self) -> None:
        self._lock = Lock()
        self._revision: UUID | None = None
        self._document: Document | None = None

    def begin_upload(self) -> UUID:
        with self._lock:
            self._revision = uuid4()
            self._document = None
            return self._revision

    def install(self, document: Document) -> None:
        with self._lock:
            if document.id != self._revision:
                raise AppError(
                    409,
                    "upload_superseded",
                    "Er is inmiddels een nieuwe upload gestart. Gebruik het nieuwste document.",
                )
            self._document = document

    def get(self, document_id: UUID) -> Document:
        with self._lock:
            if self._document is None:
                raise AppError(404, "no_document", "Upload en verwerk eerst een PDF.")
            if self._document.id != document_id:
                raise AppError(
                    409,
                    "document_replaced",
                    "Deze PDF is vervangen. Upload opnieuw of gebruik het nieuwste document.",
                )
            return self._document


class RAGService:
    def __init__(self, settings: Settings, embedder: Embedder, generator: AnswerGenerator) -> None:
        self.settings = settings
        self.embedder = embedder
        self.generator = generator
        self.store = DocumentStore()

    def ingest(self, data: bytes, filename: str, revision: UUID) -> UploadResponse:
        pdf = extract_pdf(
            data, max_pages=self.settings.max_pages, max_chars=self.settings.max_extracted_chars
        )
        chunks = chunk_pages(
            pdf.pages, chunk_size=self.settings.chunk_size, overlap=self.settings.chunk_overlap
        )
        if len(chunks) > self.settings.max_chunks:
            raise AppError(
                413,
                "too_many_chunks",
                "Deze PDF levert te veel tekstfragmenten op. Gebruik een kleiner document.",
            )
        vectors = self.embedder.embed([chunk.text for chunk in chunks])
        self.store.install(Document(id=revision, index=VectorIndex(chunks, vectors)))
        return UploadResponse(
            document_id=revision,
            filename=filename,
            page_count=pdf.total_pages,
            text_page_count=len(pdf.pages),
            chunk_count=len(chunks),
        )

    def ask(self, request: QuestionRequest) -> QuestionResponse:
        document = self.store.get(request.document_id)
        query = self.embedder.embed([request.question], is_query=True)
        hits = document.index.search(
            query, top_k=self.settings.top_k, min_similarity=self.settings.min_similarity
        )
        fallback = QuestionResponse(
            answer=INSUFFICIENT_CONTEXT, sources=[], insufficient_context=True
        )
        if not hits:
            self.store.get(document.id)
            return fallback
        generated = self.generator.generate(request.question, hits)
        # A PDF may have been replaced while an external request was running.
        self.store.get(document.id)
        if not generated.sufficient_context:
            return fallback
        allowed = {hit.chunk.id: hit for hit in hits}
        cited_ids = list(dict.fromkeys(generated.cited_chunk_ids))
        if not cited_ids or any(chunk_id not in allowed for chunk_id in cited_ids):
            raise AppError(
                502,
                "invalid_citations",
                "Het antwoord bevat geen geldige bronverwijzingen. Probeer je vraag opnieuw.",
            )
        if not generated.answer.strip():
            raise AppError(
                502, "empty_answer", "De AI-provider gaf een leeg antwoord. Probeer opnieuw."
            )
        return QuestionResponse(
            answer=generated.answer.strip(),
            insufficient_context=False,
            sources=[
                Source(
                    chunk_id=chunk_id,
                    page=allowed[chunk_id].chunk.page,
                    text=allowed[chunk_id].chunk.text,
                    score=allowed[chunk_id].score,
                )
                for chunk_id in cited_ids
            ],
        )
