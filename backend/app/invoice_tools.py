"""Allowlisted tools consume server-held extraction/order data, never model-retyped amounts."""

import json
from pathlib import Path
from time import monotonic

from pydantic import TypeAdapter, ValidationError

from app.agent_tools import ToolResult
from app.errors import AppError
from app.invoice_extraction import InvoiceExtractor, ground_invoice
from app.invoice_schemas import (
    CompareOrderArgs,
    InvoiceData,
    InvoiceDocumentArgs,
    PurchaseOrder,
    PurchaseOrderArgs,
    ValidationCheck,
)
from app.invoice_validation import compare_order, missing_fields, validate_totals
from app.schemas import Source
from app.service import Document, RAGService

INVOICE_TOOL_SPECS = {
    "extract_invoice_data": (
        InvoiceDocumentArgs,
        "Extraheer factuurvelden met letterlijke PDF-bronnen en null bij ontbrekende gegevens. "
        "Alleen het huidige document; een herhaalde oproep gebruikt dezelfde extractie.",
    ),
    "get_purchase_order": (
        PurchaseOrderArgs,
        "Lees de fictieve inkooporder met exact het in de factuur aangetroffen nummer. "
        "Eerst extract_invoice_data uitvoeren. Onbekende orders geven not_found.",
    ),
    "validate_invoice_totals": (
        InvoiceDocumentArgs,
        "Controleer de opgeslagen extractie met Decimal: regelbedragen, subtotaal, btw en totaal. "
        "Geef geen bedragen als argumenten; de server gebruikt uitsluitend de eerdere extractie.",
    ),
    "compare_invoice_with_order": (
        CompareOrderArgs,
        "Vergelijk de opgeslagen factuur met de eerder opgehaalde fictieve inkooporder. "
        "Controleer leverancier, nummer, producten, aantallen, prijzen, valuta en totalen. Geen wijzigingen.",
    ),
}


class InvoiceTools:
    def __init__(
        self, rag: RAGService, document: Document, extractor: InvoiceExtractor, deadline: float
    ) -> None:
        self.rag, self.document, self.extractor, self.deadline = rag, document, extractor, deadline
        self.invoice: InvoiceData | None = None
        self.order: PurchaseOrder | None = None
        self.sources: list[Source] = []
        self.checks: dict[str, ValidationCheck] = {}
        raw = (
            Path(__file__).with_name("fixtures").joinpath("purchase_orders.json").read_text("utf-8")
        )
        self.orders = {o.po_number: o for o in TypeAdapter(list[PurchaseOrder]).validate_json(raw)}

    def add_checks(self, checks: list[ValidationCheck]) -> None:
        self.checks.update({c.code: c for c in checks})

    def dispatch(self, name: str, arguments: dict) -> ToolResult:
        if name not in INVOICE_TOOL_SPECS:
            return ToolResult("blocked", "Deze tool is niet toegestaan.")
        try:
            args = INVOICE_TOOL_SPECS[name][0].model_validate(arguments)
        except ValidationError:
            return ToolResult(
                "error",
                "Ongeldige toolargumenten. Gebruik de document-ID of een fictief PO-nummer.",
            )
        if hasattr(args, "document_id") and args.document_id != str(self.document.id):
            return ToolResult("blocked", "Dit is niet het actieve factuurdocument.")
        if name == "extract_invoice_data":
            if self.invoice is None:
                timeout = min(self.deadline - monotonic(), self.rag.settings.gemini_timeout_seconds)
                if timeout <= 0:
                    raise AppError(504, "agent_timeout", "De maximale onderzoekstijd is bereikt.")
                extraction = self.extractor.extract(self.document.pages, timeout_seconds=timeout)
                self.invoice, self.sources = ground_invoice(extraction, self.document.pages)
                self.add_checks(missing_fields(self.invoice))
            return ToolResult(
                "success",
                "Factuurvelden geëxtraheerd en aan PDF-tekst getoetst.",
                {
                    "invoice_data": self.invoice.model_dump(mode="json"),
                    "sources": [s.model_dump(mode="json") for s in self.sources],
                    "missing_fields": [
                        c.model_dump() for c in self.checks.values() if c.stage == "extraction"
                    ],
                },
            )
        if self.invoice is None:
            return ToolResult("blocked", "Extraheer eerst de factuurgegevens.")
        if name == "validate_invoice_totals":
            checks = validate_totals(self.invoice)
        else:
            if args.po_number != self.invoice.purchase_order_number:
                return ToolResult(
                    "blocked",
                    "Het PO-nummer moet exact overeenkomen met de onderbouwde factuurextractie.",
                )
            if name == "get_purchase_order":
                self.order = self.orders.get(args.po_number)
                if self.order is None:
                    self.add_checks(
                        [
                            ValidationCheck(
                                code="po.lookup",
                                stage="purchase_order",
                                status="missing",
                                message="De fictieve inkooporder is niet gevonden.",
                            )
                        ]
                    )
                    return ToolResult("not_found", "Deze fictieve inkooporder is niet gevonden.")
                return ToolResult(
                    "success",
                    "Bijbehorende fictieve inkooporder opgehaald.",
                    {
                        "fictional": True,
                        "purchase_order": self.order.model_dump(mode="json"),
                    },
                )
            if self.order is None or self.order.po_number != args.po_number:
                return ToolResult("blocked", "Haal eerst de bijbehorende inkooporder op.")
            checks = compare_order(self.invoice, self.order)
        self.add_checks(checks)
        return ToolResult(
            "success",
            "Deterministische controles uitgevoerd; zie de afzonderlijke resultaten.",
            {"checks": [c.model_dump(mode="json") for c in checks]},
        )
