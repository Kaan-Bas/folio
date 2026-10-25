"""Ground structured fields in literal PDF quotes before any arithmetic or export."""

import re
import unicodedata
from collections.abc import Sequence
from datetime import date
from decimal import Decimal, InvalidOperation
from typing import Protocol

from app.invoice_schemas import InvoiceData, InvoiceEvidence, InvoiceExtraction
from app.pdf import PageText
from app.schemas import Source


class InvoiceExtractor(Protocol):
    def extract(
        self, pages: Sequence[PageText], *, timeout_seconds: float
    ) -> InvoiceExtraction: ...


def normalized(text: str) -> str:
    return " ".join(
        unicodedata.normalize("NFKC", text).translate({0x2010: 45, 0x2011: 45}).split()
    ).casefold()


def quoted_numbers(text: str) -> set[Decimal]:
    values = set()
    for token in re.findall(r"(?<!\w)-?\d+(?:[.,]\d+)*", text):
        if "," in token and "." in token:
            decimal_separator = "," if token.rfind(",") > token.rfind(".") else "."
            token = token.replace("." if decimal_separator == "," else ",", "").replace(",", ".")
        else:
            if re.fullmatch(r"-?\d{1,3}(?:[.,]\d{3})+", token):
                values.add(Decimal(token.replace(",", "").replace(".", "")))
            token = token.replace(",", ".")
        try:
            values.add(Decimal(token))
        except InvalidOperation:
            continue
    return values


def supported(value, quote: str, field: str) -> bool:
    if isinstance(value, Decimal):
        return value in quoted_numbers(quote)
    if isinstance(value, date):
        return any(
            normalized(v) in normalized(quote)
            for v in [value.isoformat(), value.strftime("%d-%m-%Y"), value.strftime("%d/%m/%Y")]
        )
    if field == "currency" and value == "EUR" and "€" in quote:
        return True
    return normalized(str(value)) in normalized(quote)


def ground_invoice(
    extraction: InvoiceExtraction, pages: Sequence[PageText]
) -> tuple[InvoiceData, list[Source]]:
    page_texts = {p.page: normalized(p.text) for p in pages}
    evidence: dict[str, list[InvoiceEvidence]] = {}
    for item in extraction.evidence:
        if normalized(item.quote) and normalized(item.quote) in page_texts.get(item.page, ""):
            # The extraction wraps fields in `invoice`. Accept that exact root
            # prefix too; quotes, page numbers and field values still need proof.
            field = item.field.removeprefix("invoice.")
            evidence.setdefault(field, []).append(item)
    used: dict[tuple[int, str], InvoiceEvidence] = {}

    def ground(path: str, value, parent: str | None = None):
        if value is None:
            return None
        for source in evidence.get(path, []) + evidence.get(parent or "", []):
            if supported(value, source.quote, path):
                used[(source.page, source.quote)] = source
                return value
        return None

    data = extraction.invoice
    update = {
        name: ground(name, getattr(data, name))
        for name in InvoiceData.model_fields
        if name != "line_items"
    }
    update["line_items"] = [
        line.model_copy(
            update={
                field: ground(f"line_items.{i}.{field}", getattr(line, field), f"line_items.{i}")
                for field in type(line).model_fields
            }
        )
        for i, line in enumerate(data.line_items)
    ]
    cleaned = data.model_copy(update=update)
    sources = [
        Source(chunk_id=f"invoice-p{e.page}-q{i}", page=e.page, text=e.quote, score=0.0)
        for i, e in enumerate(used.values())
    ]
    return cleaned, sources
