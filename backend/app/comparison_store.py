"""One atomic comparison pair, independent of the chat/refund document store."""

from dataclasses import dataclass
from threading import Lock
from uuid import UUID, uuid4

from app.errors import AppError
from app.service import Document


@dataclass(frozen=True)
class ComparisonPair:
    id: UUID
    document_a: Document
    document_b: Document


class ComparisonStore:
    def __init__(self) -> None:
        self._lock = Lock()
        self._revision: UUID | None = None
        self._pair: ComparisonPair | None = None

    def begin_upload(self) -> UUID:
        with self._lock:
            self._revision = uuid4()
            self._pair = None
            return self._revision

    def check_revision(self, revision: UUID) -> None:
        with self._lock:
            if self._revision != revision:
                raise AppError(
                    409, "comparison_replaced", "Er is inmiddels een nieuwe vergelijking gestart."
                )

    def install(self, pair: ComparisonPair) -> None:
        with self._lock:
            if self._revision != pair.id:
                raise AppError(
                    409, "comparison_replaced", "Er is inmiddels een nieuwe vergelijking gestart."
                )
            self._pair = pair

    def get(self, comparison_id: UUID) -> ComparisonPair:
        with self._lock:
            if self._pair is None:
                raise AppError(
                    404, "no_comparison", "Upload en verwerk eerst beide vergelijkingsdocumenten."
                )
            if self._pair.id != comparison_id:
                raise AppError(
                    409,
                    "comparison_replaced",
                    "Deze vergelijking is vervangen. Upload beide documenten opnieuw.",
                )
            return self._pair
