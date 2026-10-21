"""Generate a tiny, reproducible PDF for the README walkthrough; no provider calls."""

from pathlib import Path

import pymupdf

PAGES = [
    """Project GroenFiets - projectplan

GroenFiets is een fictieve pilot om woon-werkverkeer te verduurzamen.
De pilot start op 1 maart 2026 en duurt drie maanden.
Er zijn 24 deelfietsen beschikbaar bij station Rivierstad.
De doelgroep bestaat uit medewerkers van bedrijven in het Havenkwartier.
Het project wil autogebruik verminderen en de bereikbaarheid verbeteren.
""",
    """Budget en verantwoordelijkheden

Het totale budget van GroenFiets is 18.000 euro.
Daarvan is 12.000 euro voor de fietsen, 4.000 euro voor onderhoud
en 2.000 euro voor communicatie.
Projectleider is Noor de Vries. De gemeente beheert de fietsenstalling.
Een lokale fietsenmaker voert maandelijks onderhoud uit.
""",
    """Evaluatie en aanbevelingen

De pilot is succesvol als minimaal 60 procent van de deelnemers
twee dagen per week de fiets gebruikt in plaats van de auto.
De evaluatie bestaat uit een gebruiksmeting en een deelnemersenquete.
Aanbevelingen: communiceer vooraf over beschikbaarheid, controleer
wekelijks de bandenspanning en bespreek de resultaten na drie maanden.
Dit projectplan bevat geen omzetcijfers of resultaten van de pilot.
""",
]


def main() -> None:
    target = Path(__file__).resolve().parents[2] / "examples" / "groenfiets.pdf"
    target.parent.mkdir(parents=True, exist_ok=True)
    with pymupdf.open() as document:
        for number, text in enumerate(PAGES, start=1):
            page = document.new_page()
            page.insert_textbox((60, 65, 535, 740), text, fontsize=12, fontname="helv")
            page.insert_text((285, 800), str(number), fontsize=9)
        document.save(target)
    print(f"Voorbeeld-PDF: {target}")


if __name__ == "__main__":
    main()
