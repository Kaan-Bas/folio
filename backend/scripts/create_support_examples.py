"""Generate selectable demo PDFs from the tracked policies and canonical guidelines."""

import json
import textwrap
from pathlib import Path

import pymupdf

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "examples" / "support"


def write_pdf(path: Path, sections: list[tuple[str, str]]) -> None:
    with pymupdf.open() as document:
        for title, text in sections:
            page = None
            y = 0
            for paragraph in text.splitlines():
                lines = textwrap.wrap(paragraph.lstrip("# "), width=87) or [""]
                for line in lines:
                    if page is None or y > 725:
                        page = document.new_page()
                        page.draw_rect((40, 35, 555, 88), color=None, fill=(0.20, 0.36, 0.28))
                        page.insert_text(
                            (55, 67), title, fontsize=15, fontname="hebo", color=(1, 1, 1)
                        )
                        y = 118
                    page.insert_text((50, y), line, fontsize=10.5)
                    y += 16
        for number, page in enumerate(document, 1):
            page.insert_text(
                (50, 785),
                f"FICTIEVE DEMOGEGEVENS | Nexora Demo Shop | Pagina {number} van {len(document)}",
                fontsize=8,
            )
        document.save(path, garbage=4, deflate=True)
    print(f"Demo-PDF: {path.name}")


def main() -> None:
    guidelines = json.loads(
        (ROOT / "backend/app/fixtures/support_guidelines.json").read_text("utf-8")
    )
    guideline_text = "\n\n".join(
        [
            "FICTIEF TESTDOCUMENT. Deze richtlijnen zijn expliciete demo-configuratie.",
            "Ticketcategorieen: " + "; ".join(guidelines["categories"]),
            f"Standaardprioriteit: {guidelines['default_priority']}. "
            "Prioriteit en escalatie zijn voorstellen.",
            *[
                f"Regel {r['id']} | prioriteit {r['priority']} | "
                f"escalatie: {'ja' if r['escalate'] else 'nee'}. "
                f"Klantmelding bevat: {', '.join(r['customer_phrases'])}. {r['instruction']}"
                for r in guidelines["rules"]
            ],
            *guidelines["response_guidelines"],
        ]
    )
    policies = [
        ("Shipping Policy", (OUTPUT / "shipping_policy.md").read_text("utf-8")),
        ("Return Policy", (OUTPUT / "return_policy.md").read_text("utf-8")),
        ("Payment Policy", (OUTPUT / "payment_policy.md").read_text("utf-8")),
    ]
    guideline_section = ("Customer Service Guidelines", guideline_text)
    write_pdf(OUTPUT / "shipping_policy.pdf", [policies[0]])
    write_pdf(OUTPUT / "customer_service_guidelines.pdf", [guideline_section])
    write_pdf(OUTPUT / "support_knowledge_base.pdf", [*policies, guideline_section])


if __name__ == "__main__":
    main()
