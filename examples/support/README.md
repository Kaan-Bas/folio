# Fictieve supportvoorbeelden

Genereer de tekstselecteerbare PDF's vanuit de hoofdmap:

```powershell
.\.venv\Scripts\python.exe backend/scripts/create_support_examples.py
```

- Upload `support_knowledge_base.pdf` voor verzend-, retour- en betaalvragen in één actieve PDF.
- `shipping_policy.pdf` bevat alleen het verzendbeleid. `customer_service_guidelines.pdf` is de leesbare versie van de expliciete JSON-richtlijnen.
- Open **AI Agents → E-commerce & Customer Service → Customer Support Agent**.
- Kopieer een `customer_message` uit `tickets.json`; vul indien gewenst de bijbehorende order-ID of product-ID in.
- Een productvraag zoals `LAP-204` kan zonder PDF worden onderzocht. Zonder bedrijfsdocument mag de agent geen bedrijfsvoorwaarden verzinnen.
- `expected_tools` zijn scenarioverwachtingen voor handmatige controle; een live model mag andere relevante tools kiezen. De agent voert niet automatisch de hele lijst uit.
- Orders en producten staan in `backend/app/fixtures/support_orders.json` en `support_products.json`. De bestaande `DEMO-1001` t/m `DEMO-1003` worden ook ondersteund, met onbekende verzendvelden als `null`.
- De snapshotdatum van de nieuwe dataset is 2026-10-25; deze gegevens bewijzen geen actuele levering of voorraad.
- Categorie, prioriteit, escalatie en klantantwoord blijven voorstellen. De reviewmarkering is lokaal; de kopieerknop verstuurt niets.

De keywordvoorwaarden in `support_guidelines.json` zijn kleine, expliciete demoregels. Ze zijn geen volledige taalherkenning, klantgeschiedenis of echte klantenserviceprocedure. Bij tegenstrijdigheden en onbekende gegevens blijft menselijke verificatie nodig.
