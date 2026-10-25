"""Generate fictional old/new policies. These documents are not legal advice."""

from pathlib import Path

import pymupdf

POLICIES = {
    "refund_policy_2025.pdf": [
        """Folio Demo Shop - fictief retourbeleid 2025

Retourtermijn: een retourverzoek is mogelijk tot en met 14 kalenderdagen na levering.
De leverdag is dag 0.
Het product moet ongebruikt zijn en in de originele verpakking zitten.
""",
        """Verzendkosten en contact

De klant betaalt de retourverzendkosten.
Een retourverzoek bevat het ordernummer en de retourreden.
Contact: het fictieve klantenserviceformulier.
""",
    ],
    "refund_policy_2026.pdf": [
        """Folio Demo Shop - fictief retourbeleid 2026

Retourtermijn: een retourverzoek is mogelijk tot en met 30 kalenderdagen na levering.
De leverdag is dag 0.
Het product moet ongebruikt zijn en in de originele verpakking zitten.
""",
        """Verzendkosten, uitzonderingen en contact

De winkel betaalt de retourverzendkosten.
Een retourverzoek bevat het ordernummer en de retourreden.
Een geactiveerde softwarelicentie is uitgesloten van retour.
""",
    ],
}


def main() -> None:
    output = Path(__file__).resolve().parents[2] / "examples"
    output.mkdir(exist_ok=True)
    for filename, pages in POLICIES.items():
        with pymupdf.open() as document:
            for number, text in enumerate(pages, start=1):
                page = document.new_page()
                page.insert_textbox((55, 65, 540, 740), text, fontsize=12, fontname="helv")
                page.insert_text((285, 800), str(number), fontsize=9)
            document.save(output / filename)
        print(f"Fictief vergelijkingsdocument: {output / filename}")


if __name__ == "__main__":
    main()
