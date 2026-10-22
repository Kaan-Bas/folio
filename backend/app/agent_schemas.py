"""Public agent API and strictly validated tool arguments."""

from datetime import date
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator

from app.schemas import ErrorDetail, Source

OrderId = Annotated[str, StringConstraints(strict=True, pattern=r"^DEMO-\d{4}$")]
ISODate = Annotated[str, StringConstraints(strict=True, pattern=r"^\d{4}-\d{2}-\d{2}$")]
DISCLAIMER = "Conceptadvies op basis van fictieve gegevens. Geen definitief terugbetalingsbesluit; er worden geen bestellingen gewijzigd of terugbetalingen uitgevoerd."


class AgentRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    document_id: UUID
    instruction: str = Field(min_length=1, max_length=2000)
    order_id: OrderId | None = None

    @field_validator("instruction")
    @classmethod
    def trim_instruction(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Vul een opdracht in.")
        return value.strip()


class SearchPolicyArgs(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    query: str = Field(min_length=1, max_length=2000)

    @field_validator("query")
    @classmethod
    def nonempty(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Een zoekvraag mag niet leeg zijn.")
        return value.strip()


class OrderDetailsArgs(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    order_id: OrderId


class DaysBetweenArgs(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    start_date: ISODate
    end_date: ISODate

    @field_validator("start_date", "end_date")
    @classmethod
    def valid_date(cls, value: str) -> str:
        date.fromisoformat(value)
        return value


class ToolExecution(BaseModel):
    sequence: int
    name: str
    status: Literal["success", "not_found", "error", "blocked"]
    message: str


class AgentResponse(BaseModel):
    answer: str
    sources: list[Source] = Field(default_factory=list)
    tool_calls: list[ToolExecution] = Field(default_factory=list, max_length=5)
    status: Literal["completed", "insufficient_information", "limit_reached", "error"]
    error: ErrorDetail | None = None
    disclaimer: str = DISCLAIMER
    concept_advice: Literal[True] = True
