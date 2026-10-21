from dataclasses import dataclass

import pymupdf

from app.errors import AppError


@dataclass(frozen=True)
class PageText:
    page: int
    text: str


@dataclass(frozen=True)
class ExtractedPDF:
    pages: tuple[PageText, ...]
    total_pages: int


def extract_pdf(data: bytes, *, max_pages: int = 200, max_chars: int = 1_000_000) -> ExtractedPDF:
    if not data.startswith(b"%PDF-"):
        raise AppError(400, "invalid_pdf", "Dit bestand bevat geen herkenbare PDF.")
    try:
        with pymupdf.open(stream=data, filetype="pdf") as document:
            if document.needs_pass:
                raise AppError(400, "encrypted_pdf", "Verwijder eerst het wachtwoord van de PDF.")
            if len(document) > max_pages:
                raise AppError(
                    413, "too_many_pages", f"Gebruik een PDF van maximaal {max_pages} pagina's."
                )
            pages: list[PageText] = []
            chars = 0
            for number, page in enumerate(document, start=1):
                text = page.get_text("text", sort=True).replace("\x00", "").strip()
                chars += len(text)
                if chars > max_chars:
                    raise AppError(
                        413,
                        "too_much_text",
                        "Deze PDF bevat te veel tekst. Gebruik een kleiner document.",
                    )
                if text:
                    # Keep physical PDF page numbers, including gaps caused by blank pages.
                    pages.append(PageText(page=number, text=text))
            if not pages:
                raise AppError(
                    400,
                    "empty_pdf",
                    "Geen leesbare tekst gevonden. Een gescande PDF heeft eerst OCR nodig.",
                )
            return ExtractedPDF(pages=tuple(pages), total_pages=len(document))
    except AppError:
        raise
    except (RuntimeError, ValueError) as exc:
        raise AppError(
            400, "unreadable_pdf", "De PDF is beschadigd of kan niet worden gelezen."
        ) from exc
