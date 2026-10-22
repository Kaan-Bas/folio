"""Generate a fictional, reproducible three-page return policy. No API calls."""

from pathlib import Path

import pymupdf

PAGES = [
    """Folio Demo Shop - fictief retourbeleid

Dit document en alle bestellingen in deze demo zijn volledig fictief.
Een analyse van dit document is alleen een conceptadvies, geen besluit.

Retourtermijn
Een retourverzoek kan tot en met 30 kalenderdagen na levering worden ingediend.
Bereken het verschil tussen leverdatum en retouraanvraagdatum; de leverdag is dag 0.
De orderdatum is niet het begin van de retourtermijn.
Voor verzoeken na 30 dagen is handmatige beoordeling nodig; er is geen automatische toekenning.
""",
    """Voorwaarden en uitzonderingen

Een fysiek product moet ongebruikt zijn en in de originele verpakking zitten.
De klant moet een bestelnummer en een retourreden opgeven.
Een geactiveerde digitale softwarelicentie valt buiten dit fictieve retourbeleid.
Bij ontbrekende informatie over productstaat of uitzonderingen is nader onderzoek nodig.
Dit document bevat geen regels voor beschadigde producten, internationale retouren of verzendkosten.
""",
    """Beoordeling en bevoegdheden

Een medewerker controleert de bestelling, de termijn en de productvoorwaarden.
Een AI-assistent kan beleidsbronnen opzoeken en een conceptadvies formuleren.
De AI-assistent mag geen bestelling wijzigen, geen retour goedkeuren en geen geld terugboeken.
Er worden in deze demo geen financiele acties uitgevoerd.
De prijs is alleen achtergrondinformatie; dit beleid belooft geen terugbetalingsbedrag.
""",
]


def main() -> None:
    target = Path(__file__).resolve().parents[2] / "examples" / "refund_policy.pdf"
    target.parent.mkdir(parents=True, exist_ok=True)
    with pymupdf.open() as document:
        for number, text in enumerate(PAGES, start=1):
            page = document.new_page()
            page.insert_textbox((55, 65, 540, 740), text, fontsize=11, fontname="helv")
            page.insert_text((285, 800), str(number), fontsize=9)
        document.save(target)
    print(f"Fictief retourbeleid: {target}")


if __name__ == "__main__":
    main()
