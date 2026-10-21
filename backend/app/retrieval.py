from collections.abc import Sequence
from dataclasses import dataclass

import faiss
import numpy as np
from numpy.typing import NDArray

from app.chunking import Chunk
from app.errors import AppError


@dataclass(frozen=True)
class SearchHit:
    chunk: Chunk
    score: float


def normalized(vectors: NDArray[np.float32], expected_rows: int) -> NDArray[np.float32]:
    matrix = np.array(vectors, dtype=np.float32, order="C", copy=True)
    if (
        matrix.ndim != 2
        or matrix.shape[0] != expected_rows
        or matrix.shape[1] == 0
        or not np.isfinite(matrix).all()
        or np.any(np.linalg.norm(matrix, axis=1) == 0)
    ):
        raise AppError(
            502, "invalid_embeddings", "Het embeddingmodel gaf ongeldige embeddings terug."
        )
    faiss.normalize_L2(matrix)
    return matrix


class VectorIndex:
    def __init__(self, chunks: Sequence[Chunk], vectors: NDArray[np.float32]) -> None:
        if not chunks:
            raise ValueError("Cannot index an empty document.")
        self.chunks = tuple(chunks)
        matrix = normalized(vectors, len(chunks))
        # Exact inner product on unit vectors equals cosine similarity; no training is needed.
        self.index = faiss.IndexFlatIP(matrix.shape[1])
        self.index.add(matrix)

    def search(
        self, query: NDArray[np.float32], *, top_k: int, min_similarity: float
    ) -> list[SearchHit]:
        matrix = normalized(query, 1)
        if matrix.shape[1] != self.index.d:
            raise AppError(
                502,
                "embedding_dimension",
                "Het embeddingmodel gaf een andere vectorgrootte terug. Upload de PDF opnieuw.",
            )
        scores, indices = self.index.search(matrix, min(top_k, len(self.chunks)))
        return [
            SearchHit(chunk=self.chunks[int(index)], score=float(score))
            for score, index in zip(scores[0], indices[0], strict=True)
            if index >= 0 and score >= min_similarity
        ]
