"""Chat-only context selection; agent retrieval and the shared index stay unchanged."""

import math
import re
import unicodedata
from collections import Counter, defaultdict
from collections.abc import Sequence

from app.retrieval import SearchHit

MAX_CHAT_CONTEXT_CHARS = 24_000
STOP_WORDS = frozenset(
    "de het een en of van voor op in aan met door bij uit te is zijn was wordt worden "
    "wat welk welke hoe ik je mijn mag kan per er over dit deze dat die document pdf "
    "vat samen samenvatting overzicht geef vertel staat staan "
    "the a an and or of for on in at with by from to is are was what which how i you "
    "my can may does do this that document please "
    "summarize summarise summary overview tell about".split()
)


def _tokens(text: str) -> list[str]:
    text = unicodedata.normalize("NFKC", text).casefold()
    return [word for word in re.findall(r"\w+", text) if word not in STOP_WORDS]


def _is_overview(question: str) -> bool:
    words = set(re.findall(r"\w+", unicodedata.normalize("NFKC", question).casefold()))
    return (
        bool(
            words
            & {
                "samenvatting",
                "samenvatten",
                "overzicht",
                "summary",
                "summarize",
                "summarise",
                "overview",
            }
        )
        or {"vat", "samen"} <= words
    )


def _lexical_ranking(question: str, hits: Sequence[SearchHit]) -> list[SearchHit]:
    """BM25 provides literal-term evidence alongside the existing dense embeddings."""
    terms = set(_tokens(question))
    if not terms:
        return []
    counts = {hit.chunk.id: Counter(_tokens(hit.chunk.text)) for hit in hits}
    lengths = {key: sum(value.values()) for key, value in counts.items()}
    average = max(1.0, sum(lengths.values()) / len(hits))
    frequency = Counter(term for count in counts.values() for term in terms if term in count)

    def score(hit: SearchHit) -> float:
        count = counts[hit.chunk.id]
        length_factor = 1.2 * (0.25 + 0.75 * lengths[hit.chunk.id] / average)
        return sum(
            math.log(1 + (len(hits) - frequency[term] + 0.5) / (frequency[term] + 0.5))
            * count[term]
            * 2.2
            / (count[term] + length_factor)
            for term in terms
            if count[term]
        )

    scored = [(score(hit), hit) for hit in hits]
    return [
        hit for value, hit in sorted(scored, key=lambda pair: pair[0], reverse=True) if value > 0
    ]


def select_chat_context(
    question: str,
    ranked_hits: Sequence[SearchHit],
    *,
    top_k: int,
    min_similarity: float,
    max_chars: int = MAX_CHAT_CONTEXT_CHARS,
) -> list[SearchHit]:
    """Fuse ranks, then expand page-local neighbors without truncating source chunks.

    Dense search alone can rank short PDF footers above the relevant introduction.
    Adjacent chunks repair sentences split at the configured character boundary.
    Broad questions without a literal match also receive the opening passage.
    Cosine scores, chunk IDs and physical page numbers remain the index originals.
    """
    if not ranked_hits:
        return []
    # IDs encode extraction order (pN-cM); do not sort c10 before c2.
    ordered = sorted(ranked_hits, key=lambda h: (h.chunk.page, int(h.chunk.id.rsplit("-c", 1)[1])))
    overview = _is_overview(question)
    # For a small document, every passage is relevant to a document-wide summary.
    if overview and sum(len(hit.chunk.text) for hit in ordered) <= max_chars:
        return ordered
    dense = [hit for hit in ranked_hits if hit.score >= min_similarity][:top_k]
    lexical = _lexical_ranking(question, ranked_hits)[:top_k]
    if not dense and not lexical and not overview:
        return []
    fused: dict[str, float] = defaultdict(float)
    by_id = {hit.chunk.id: hit for hit in ranked_hits}
    # Literal matches win ties when TOP_K is small and the rankers disagree.
    for ranking in (lexical, dense):
        for rank, hit in enumerate(ranking, start=1):
            # Reciprocal ranks combine unlike scoring scales without changing cosine values.
            fused[hit.chunk.id] += 1 / (60 + rank)
    anchors = [by_id[key] for key in sorted(fused, key=fused.get, reverse=True)[:top_k]]
    if (overview or not lexical) and ordered[0].chunk.id not in {hit.chunk.id for hit in anchors}:
        anchors.insert(0, ordered[0])
    positions = {hit.chunk.id: i for i, hit in enumerate(ordered)}
    candidates = list(anchors)
    for anchor in anchors:
        position = positions[anchor.chunk.id]
        for neighbor in (position - 1, position + 1):
            if 0 <= neighbor < len(ordered) and ordered[neighbor].chunk.page == anchor.chunk.page:
                candidates.append(ordered[neighbor])
    selected: dict[str, SearchHit] = {}
    remaining = max_chars
    for hit in candidates:
        if hit.chunk.id not in selected and len(hit.chunk.text) <= remaining:
            selected[hit.chunk.id] = hit
            remaining -= len(hit.chunk.text)
    return [hit for hit in ordered if hit.chunk.id in selected]
