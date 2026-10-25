# Fictieve facturen

Deze map bevat uitsluitend demogegevens. Geen enkel bestand is een geldige factuur of betalingsopdracht.

De PDF's kunnen vanuit de hoofdmap worden gegenereerd met:

```powershell
.\.venv\Scripts\python.exe backend/scripts/create_invoice_examples.py
```

De generator gebruikt `cases.json`. De bijbehorende fictieve inkooporders staan in `backend/app/fixtures/purchase_orders.json`.

| PDF | Verwachte controle-uitkomst |
| --- | --- |
| `invoice_correct.pdf` | PO-DEMO-1001; regels 250,00 + 80,00, subtotaal 330,00, btw 69,30, totaal 399,30 EUR |
| `invoice_wrong_total.pdf` | Vermeld totaal 409,30; berekend totaal en PO-totaal 399,30 EUR |
| `invoice_price_difference.pdf` | Stoelprijs 135,00 in plaats van 125,00 EUR; factuur rekent intern correct, maar wijkt af van de PO |
| `invoice_unknown_po.pdf` | PO-DEMO-9999 bestaat niet in de fixture; geen vervangende order kiezen |
| `invoice_missing_data.pdf` | Vervaldatum, eenheidsprijs van de eerste regel en btw-percentage ontbreken; deze waarden blijven null |

Alle PDF's bevatten het label `FICTIEVE TESTFACTUUR` en selecteerbare tekst. Upload één bestand in Folio en kies **Invoice Processing**. Voor een volledige controle kan de standaardopdracht worden gebruikt. Voor alleen extractie: 'Wat is het factuurnummer?'. De LLM kiest de tools; bovenstaande verwachtingen zijn geen garantie voor de kwaliteit van een live extractie.

Bedragen worden door Python met Decimal gecontroleerd. Een menselijke reviewmarkering bestaat alleen lokaal in de interface en de JSON-export. Er vindt geen financiële goedkeuring, betaling of externe boekhoudkoppeling plaats.
