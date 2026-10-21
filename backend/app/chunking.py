from collections.abc import Sequence
from dataclasses import dataclass

from app.pdf import PageText


@dataclass(frozen=True)
class Chunk:
    id: str
    page: int
    text: str


def chunk_pages(
    pages: Sequence[PageText], *, chunk_size: int = 1200, overlap: int = 200
) -> list[Chunk]:
    """Character windows per page; no chunk can acquire an ambiguous source page."""
    if chunk_size <= 0 or not 0 <= overlap < chunk_size:
        raise ValueError("Use chunk_size > 0 and 0 <= overlap < chunk_size.")
    chunks: list[Chunk] = []
    for page in pages:
        start = 0
        window = 0
        while start < len(page.text):
            end = min(start + chunk_size, len(page.text))
            text = page.text[start:end].strip()
            if text:
                chunks.append(Chunk(id=f"p{page.page}-c{window}", page=page.page, text=text))
            if end == len(page.text):
                break
            start = end - overlap
            window += 1
    return chunks
