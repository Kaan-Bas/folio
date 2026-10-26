"""Customer-support API, tool arguments and evidence-backed recommendations."""

from datetime import date
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from app.agent_schemas import SearchPolicyArgs, ToolExecution
from app.schemas import ErrorDetail, Source

SupportOrderId = Annotated[str, StringConstraints(strict=True, pattern=r"^(?:ORD|DEMO)-\d{4}$")]
ProductId = Annotated[str, StringConstraints(strict=True, pattern=r"^[A-Z]{2,8}-\d{3,4}$")]
SupportText = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)
]
TicketCategory = Literal[
    "Shipping & Delivery",
    "Returns & Refunds",
    "Product Information",
    "Payments & Billing",
    "Complaints",
    "Other",
]
Priority = Literal["low", "medium", "high", "urgent"]
Basis = Literal["model_suggestion", "configured_guideline"]


class SupportRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    customer_message: SupportText
    document_id: UUID | None = None
    order_id: SupportOrderId | None = None
    product_id: ProductId | None = None


class SearchKnowledgeArgs(SearchPolicyArgs):
    pass


class SupportOrderArgs(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    order_id: SupportOrderId


class ProductArgs(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    product_id: ProductId


class GuidelinesArgs(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class SupportOrder(BaseModel):
    model_config = ConfigDict(extra="forbid")
    order_id: SupportOrderId
    order_date: date
    order_status: str
    product: str
    product_id: ProductId | None = None
    expected_delivery_date: date | None = None
    delivered_at: date | None = None
    shipping_status: str | None = None


class SupportProduct(BaseModel):
    model_config = ConfigDict(extra="forbid")
    product_id: ProductId
    name: str
    description: str
    specifications: dict[str, str]
    availability: str | None = None
    conditions: list[str]


class GuidelineRule(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    signal: Literal["repeated_contact", "unsafe_product", "delivery_conflict"]
    customer_phrases: list[str] = Field(min_length=1)
    priority: Priority
    escalate: bool
    instruction: str


class SupportGuidelines(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    fictional: Literal[True]
    categories: list[TicketCategory]
    default_priority: Priority
    rules: list[GuidelineRule]
    response_guidelines: list[str]


class SupportFinding(BaseModel):
    model_config = ConfigDict(extra="forbid")
    information: SupportText
    reference_ids: list[str] = Field(min_length=1, max_length=8)


class EscalationRecommendation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    recommended: bool
    reason: SupportText
    basis: Basis = "model_suggestion"
    rule_ids: list[str] = Field(default_factory=list, max_length=6)


class SupportAnalysis(BaseModel):
    model_config = ConfigDict(extra="forbid")
    ticket_category: TicketCategory
    suggested_priority: Priority
    priority_reason: SupportText
    priority_basis: Basis = "model_suggestion"
    priority_rule_ids: list[str] = Field(default_factory=list, max_length=6)
    short_summary: SupportText
    customer_intent: SupportText
    relevant_information: list[SupportFinding] = Field(default_factory=list, max_length=12)
    missing_information: list[SupportText] = Field(default_factory=list, max_length=16)
    recommended_next_action: SupportText
    escalation: EscalationRecommendation
    suggested_customer_response: SupportText


class SupportSource(Source):
    document_id: UUID
    filename: str
    reference_id: str


class SupportDataReference(BaseModel):
    reference_id: str
    kind: Literal["order", "product", "guidelines"]
    label: str
    data: dict


class SupportResponse(BaseModel):
    document_id: UUID | None = None
    analysis: SupportAnalysis | None = None
    sources: list[SupportSource] = Field(default_factory=list)
    data_references: list[SupportDataReference] = Field(default_factory=list)
    tool_calls: list[ToolExecution] = Field(default_factory=list, max_length=12)
    tool_call_limit: int
    status: Literal["completed", "insufficient_information", "limit_reached", "error"]
    error: ErrorDetail | None = None
    human_review_required: Literal[True] = True
    disclaimer: str = (
        "Conceptvoorstellen met fictieve gegevens. Een medewerker moet categorie, prioriteit, "
        "escalatie en klantantwoord controleren. "
        "Er worden geen berichten verzonden of gegevens gewijzigd."
    )
