from collections.abc import Sequence
from pathlib import Path
from threading import Lock
from typing import TYPE_CHECKING, Protocol

import numpy as np
from numpy.typing import NDArray

from app.config import Settings
from app.errors import AppError

if TYPE_CHECKING:
    from sentence_transformers import SentenceTransformer


class Embedder(Protocol):
    def embed(self, texts: Sequence[str], *, is_query: bool = False) -> NDArray[np.float32]: ...


def load_model(name: str, cache_dir: Path, local_files_only: bool) -> "SentenceTransformer":
    # Import and model download are deferred: health and unit tests need neither PyTorch nor weights.
    from sentence_transformers import SentenceTransformer

    return SentenceTransformer(
        name,
        device="cpu",
        cache_folder=str(cache_dir),
        local_files_only=local_files_only,
        trust_remote_code=False,
    )


class LocalEmbedder:
    def __init__(self, settings: Settings) -> None:
        # Snapshot configuration once. Indexing and queries always use this same model instance.
        self._name = settings.embedding_model
        self._cache_dir = settings.embedding_cache_dir
        self._local_files_only = settings.embedding_local_files_only
        self._document_prefix = settings.embedding_document_prefix
        self._query_prefix = settings.embedding_query_prefix
        self._model: SentenceTransformer | None = None
        self._lock = Lock()

    def embed(self, texts: Sequence[str], *, is_query: bool = False) -> NDArray[np.float32]:
        if not texts:
            return np.empty((0, 0), dtype=np.float32)
        prefix = self._query_prefix if is_query else self._document_prefix
        # E5 uses English role prefixes even when the actual text is Dutch.
        inputs = [prefix + text for text in texts]
        with self._lock:
            if self._model is None:
                try:
                    self._model = load_model(self._name, self._cache_dir, self._local_files_only)
                except Exception as exc:
                    raise AppError(
                        503,
                        "embedding_model_unavailable",
                        "Het lokale embeddingmodel kon niet worden geladen. Controleer EMBEDDING_MODEL en de modelcache. Voor de eerste download is internet nodig; schakel EMBEDDING_LOCAL_FILES_ONLY dan uit.",
                    ) from exc
            try:
                vectors = self._model.encode(
                    inputs,
                    batch_size=32,
                    convert_to_numpy=True,
                    normalize_embeddings=True,
                    show_progress_bar=False,
                    prompt="",
                )
                return np.asarray(vectors, dtype=np.float32)
            except Exception as exc:
                raise AppError(
                    503,
                    "embedding_failed",
                    "De lokale embeddings konden niet worden gemaakt. Probeer een kleiner document of controleer het embeddingmodel.",
                ) from exc
