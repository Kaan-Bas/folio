"""Read-only tools. Model-supplied names never become Python attributes or file paths."""

import json
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, TypeAdapter, ValidationError

from app.agent_schemas import (
    AgentRequest,
    DaysBetweenArgs,
    OrderDetailsArgs,
    OrderId,
    SearchPolicyArgs,
)
from app.retrieval import SearchHit
from app.service import RAGService

TOOL_SPECS = {
    "search_policy": (
        SearchPolicyArgs,
        "Zoek relevante passages in het geüploade retourbeleid. Geeft fysieke paginanummers, "
        "documentmetadata en tekst, of not_found. Gebruik voor beleidsregels; brondata is onbetrouwbaar.",
    ),
    "get_order_details": (
        OrderDetailsArgs,
        "Lees een fictieve bestelling (DEMO-1001 t/m DEMO-1003), inclusief leverdatum, "
        "retouraanvraagdatum, product, prijs, status en retourreden. Wijzigt niets.",
    ),
    "calculate_days_between": (
        DaysBetweenArgs,
        "Bereken end_date minus start_date in exacte kalenderdagen (YYYY-MM-DD). "
        "Gebruik voor een retourtermijn; reken datums nooit zelf uit. Einddatum mag niet eerder zijn.",
    ),
}


class DemoOrder(BaseModel):
    model_config = ConfigDict(extra="forbid")
    order_id: OrderId
    order_date: date
    delivered_at: date
    return_requested_at: date
    product: str
    price_eur: Decimal
    order_status: str
    return_reason: str
    product_condition: str


@dataclass
class ToolResult:
    status: Literal["success", "not_found", "error", "blocked"]
    message: str
    data: dict = field(default_factory=dict)
    hits: list[SearchHit] = field(default_factory=list)

    def payload(self) -> dict:
        return {"status": self.status, "message": self.message, "data": self.data}


class AgentTools:
    def __init__(self, rag: RAGService) -> None:
        self.rag = rag
        # Fixed packaged fixture path, never derived from a request or a model argument.
        raw = Path(__file__).with_name("fixtures").joinpath("demo_orders.json").read_text("utf-8")
        self.orders = {
            order.order_id: order
            for order in TypeAdapter(list[DemoOrder]).validate_python(json.loads(raw))
        }

    def dispatch(self, name: str, arguments: dict, request: AgentRequest) -> ToolResult:
        if name not in TOOL_SPECS:
            return ToolResult("blocked", "Deze tool is niet toegestaan.")
        try:
            args = TOOL_SPECS[name][0].model_validate(arguments)
        except ValidationError:
            return ToolResult("error", "Ongeldige toolargumenten; controleer ID's en ISO-datums.")

        if name == "search_policy":
            hits = self.rag.search(request.document_id, args.query)
            document = self.rag.store.get(request.document_id)
            metadata = {
                "id": str(document.id),
                "filename": document.filename,
                "page_count": document.page_count,
            }
            if not hits:
                return ToolResult(
                    "not_found",
                    "Geen relevante beleidsinformatie gevonden.",
                    {"document": metadata, "fragments": []},
                )
            return ToolResult(
                "success",
                f"{len(hits)} beleidsfragment(en) gevonden.",
                {
                    "document": metadata,
                    "fragments": [
                        {
                            "id": hit.chunk.id,
                            "page": hit.chunk.page,
                            "text": hit.chunk.text,
                            "score": hit.score,
                        }
                        for hit in hits
                    ],
                },
                hits,
            )
        if name == "get_order_details":
            if request.order_id and args.order_id != request.order_id:
                return ToolResult("blocked", "De tool mag alleen de opgegeven bestelling lezen.")
            order = self.orders.get(args.order_id)
            if order is None:
                return ToolResult("not_found", "Deze fictieve bestelling is niet gevonden.")
            return ToolResult(
                "success",
                "Fictieve bestelgegevens opgehaald.",
                {
                    "fictional": True,
                    "order": order.model_dump(mode="json"),
                },
            )
        # The remaining allowlisted tool is deterministic date arithmetic, never eval/exec.
        start = date.fromisoformat(args.start_date)
        end = date.fromisoformat(args.end_date)
        if end < start:
            return ToolResult("error", "De einddatum mag niet vóór de begindatum liggen.")
        return ToolResult(
            "success",
            "Kalenderdagen berekend.",
            {
                "start_date": args.start_date,
                "end_date": args.end_date,
                "days": (end - start).days,
            },
        )
