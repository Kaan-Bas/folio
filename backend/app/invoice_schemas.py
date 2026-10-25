"""Nullable invoice data, decimal amounts and server-owned review results."""

from datetime import date
from decimal import Decimal
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, BeforeValidator, ConfigDict, Field, StringConstraints

from app.agent_schemas import ToolExecution
from app.schemas import ErrorDetail, Source


def reject_float(value: object) -> object:
    if isinstance(value, (float, bool)):
        raise ValueError("Gebruik een decimale string voor bedragen en aantallen.")
    return value


Amount = Annotated[Decimal, BeforeValidator(reject_float), Field(max_digits=14, decimal_places=4)]
Text = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
PoNumber = Annotated[str, StringConstraints(strict=True, pattern=r"^PO-DEMO-\d{4}$")]
DISCLAIMER = "Technisch conceptresultaat met fictieve gegevens. Geen financiële of juridische goedkeuring en geen betalingsactie. Menselijke controle blijft nodig."


class InvoiceLine(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    item_code: Text | None = None
    description: Text | None = None
    quantity: Amount | None = None
    unit_price: Amount | None = None
    line_total: Amount | None = None


class InvoiceData(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    invoice_number: Text | None = None
    supplier_name: Text | None = None
    invoice_date: date | None = None
    due_date: date | None = None
    purchase_order_number: Text | None = None
    currency: Annotated[str, StringConstraints(pattern=r"^[A-Z]{3}$")] | None = None
    line_items: list[InvoiceLine] = Field(default_factory=list, max_length=20)
    subtotal: Amount | None = None
    tax_rate: Amount | None = None
    tax_amount: Amount | None = None
    total_amount: Amount | None = None


class InvoiceEvidence(BaseModel):
    model_config = ConfigDict(extra="forbid")
    field: str = Field(min_length=1, max_length=80)
    page: int = Field(ge=1)
    quote: str = Field(min_length=1, max_length=500)


class InvoiceExtraction(BaseModel):
    model_config = ConfigDict(extra="forbid")
    invoice: InvoiceData
    evidence: list[InvoiceEvidence] = Field(max_length=100)


def invoice_extraction_json_schema() -> dict:
    """Small wire schema; all semantic/precision limits stay in local validation.

    The full Pydantic schema can exceed Gemini's structured-output complexity
    limits. Inline the finite invoice model and request explicit nulls, with no
    defaults, format/length constraints or Decimal-specific extension keywords.
    Serialization mode describes Decimal output as strings rather than numbers.
    """
    schema = InvoiceExtraction.model_json_schema(mode="serialization")
    definitions = schema.get("$defs", {})

    def simplify(node: dict) -> dict:
        if "$ref" in node:
            return simplify(definitions[node["$ref"].rsplit("/", 1)[-1]])
        if "anyOf" in node:
            # These models contain only optional values, not heterogeneous unions.
            alternatives = [part for part in node["anyOf"] if part.get("type") != "null"]
            if len(alternatives) != 1 or len(node["anyOf"]) != 2:
                raise ValueError("Unexpected union in invoice output schema.")
            result = simplify(alternatives[0])
            result["type"] = [result["type"], "null"]
            return result
        if node["type"] == "object":
            properties = {name: simplify(value) for name, value in node["properties"].items()}
            return {
                "type": "object",
                "properties": properties,
                "required": list(properties),
                "additionalProperties": False,
            }
        if node["type"] == "array":
            return {"type": "array", "items": simplify(node["items"])}
        return {"type": node["type"]}

    return simplify(schema)


class InvoiceRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    document_id: UUID
    instruction: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)
    ]


class InvoiceDocumentArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    document_id: str = Field(min_length=36, max_length=36)


class PurchaseOrderArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    po_number: PoNumber


class CompareOrderArgs(InvoiceDocumentArgs):
    po_number: PoNumber


class PurchaseOrder(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    po_number: PoNumber
    supplier_name: Text
    currency: str
    order_status: Literal["approved", "cancelled"]
    line_items: list[InvoiceLine] = Field(min_length=1, max_length=20)
    total_amount: Amount


class ValidationCheck(BaseModel):
    code: str
    stage: Literal["extraction", "totals", "purchase_order"]
    status: Literal["passed", "failed", "missing"]
    message: str
    expected: str | None = None
    actual: str | None = None


class InvoiceSummary(BaseModel):
    model_config = ConfigDict(extra="forbid")
    summary: str = Field(min_length=1, max_length=2000)


class InvoiceResponse(BaseModel):
    document_id: UUID
    filename: str = ""
    invoice_data: InvoiceData | None = None
    validations: list[ValidationCheck] = Field(default_factory=list)
    discrepancies: list[ValidationCheck] = Field(default_factory=list)
    sources: list[Source] = Field(default_factory=list)
    summary: str
    review_status: Literal["validated", "discrepancy_found", "insufficient_data", "error"]
    tool_calls: list[ToolExecution] = Field(default_factory=list, max_length=16)
    tool_call_limit: int
    error: ErrorDetail | None = None
    disclaimer: str = DISCLAIMER
