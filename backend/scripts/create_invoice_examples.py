"""Generate separate, selectable fictional invoices; never modify other examples."""

import json
from pathlib import Path

import pymupdf

ROOT = Path(__file__).resolve().parents[2]


def invoice_lines(case: dict) -> list[str]:
    """Stable literal lines also serve as extraction ground truth in mocked tests."""
    lines = [
        "FICTIEVE TESTFACTUUR - UITSLUITEND DEMOGEGEVENS",
        "Nexora Demo Supplies B.V.",
        f"Factuurnummer: {case['invoice_number']}",
        "Factuurdatum: 2026-10-21",
    ]
    if case["due_date"]:
        lines.append(f"Vervaldatum: {case['due_date']}")
    lines += [
        f"Inkooporder: {case['po_number']}",
        "Valuta: EUR",
        "Factuurregels (bedragen exclusief btw):",
    ]
    price = f" | Prijs {case['unit_price']}" if case["unit_price"] else ""
    lines += [
        f"CHAIR-01 | Ergonomische bureaustoel | Aantal {case['quantity']}{price} | Regelbedrag {case['line_total']}",
        "DOCK-02 | USB-C dockingstation | Aantal 1 | Prijs 80.00 | Regelbedrag 80.00",
        f"Subtotaal: {case['subtotal']}",
    ]
    if case["tax_rate"]:
        lines.append(f"Btw-percentage: {case['tax_rate']}")
    lines += [f"Btw-bedrag: {case['tax_amount']}", f"Totaalbedrag: {case['total_amount']}"]
    return lines


def main() -> None:
    output = ROOT / "examples" / "invoices"
    cases = json.loads((output / "cases.json").read_text("utf-8"))
    for case in cases:
        with pymupdf.open() as doc:
            page = doc.new_page()
            page.draw_rect((45, 40, 550, 91), color=None, fill=(0.08, 0.22, 0.25))
            page.insert_text(
                (60, 72), "NEXORA DEMO SUPPLIES", fontname="hebo", fontsize=18, color=(1, 1, 1)
            )
            y = 121
            for line in invoice_lines(case):
                size = 8.1 if len(line) > 80 else 10.5
                page.insert_text((50, y), line, fontsize=size, fontname="helv")
                y += 25 if line == "Factuurregels (bedragen exclusief btw):" else 23
            page.draw_line((50, 735), (545, 735), color=(0.8, 0.85, 0.85))
            page.insert_text(
                (50, 758),
                "Alle bedrijven en bedragen zijn fictief. Niet betalen; geen geldig financieel document.",
                fontsize=9,
            )
            page.insert_text((50, 779), "Folio Invoice Processing | Pagina 1 van 1", fontsize=8)
            path = output / case["filename"]
            doc.save(path, garbage=4, deflate=True)
        print(f"Fictieve factuur: {path}")


if __name__ == "__main__":
    main()
