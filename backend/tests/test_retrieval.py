import numpy as np
import pytest

from app.chunking import Chunk
from app.errors import AppError
from app.retrieval import VectorIndex


def test_real_faiss_cosine_ranking_threshold_and_page_mapping():
    chunks = [Chunk("a", 2, "fiets"), Chunk("b", 7, "trein"), Chunk("c", 9, "auto")]
    vectors = np.array([[5, 0], [0, 2], [1, 1]], dtype=np.float32)
    original = vectors.copy()
    index = VectorIndex(chunks, vectors)
    hits = index.search(np.array([[3, 0]], dtype=np.float32), top_k=10, min_similarity=0.6)
    assert [(hit.chunk.id, hit.chunk.page) for hit in hits] == [("a", 2), ("c", 9)]
    assert hits[0].score == pytest.approx(1.0)
    assert hits[1].score == pytest.approx(1 / np.sqrt(2))
    np.testing.assert_array_equal(vectors, original)


def test_no_relevant_hits():
    index = VectorIndex([Chunk("a", 1, "a")], np.array([[1, 0]], dtype=np.float32))
    assert index.search(np.array([[0, 1]], dtype=np.float32), top_k=4, min_similarity=0.2) == []


@pytest.mark.parametrize(
    "vectors",
    [
        [[0, 0]],
        [[float("nan"), 1]],
        [[float("inf"), 1]],
        [],
        [[1]],
        [[1, 2], [3, 4]],
    ],
)
def test_bad_embeddings_rejected(vectors):
    # [[1]] is a valid one-dimensional embedding, so use two chunks for its row mismatch.
    chunks = [Chunk("a", 1, "a")]
    if vectors == [[1]]:
        chunks.append(Chunk("b", 2, "b"))
    with pytest.raises(AppError, match="embeddings"):
        VectorIndex(chunks, np.array(vectors, dtype=np.float32))


def test_query_dimension_change_is_reported():
    index = VectorIndex([Chunk("a", 1, "a")], np.array([[1, 0]], dtype=np.float32))
    with pytest.raises(AppError) as error:
        index.search(np.array([[1, 0, 0]], dtype=np.float32), top_k=4, min_similarity=0)
    assert error.value.code == "embedding_dimension"
