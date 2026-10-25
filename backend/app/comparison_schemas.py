"""Comparison API contracts. Document A is the old/baseline version, B the new version."""

from typing import Annotated, Literal, Self
from uuid import UUID

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    field_validator,
    model_validator,
)

from app.agent_schemas import ToolExecution
from app.schemas import ErrorDetail, Source, UploadResponse

ChangeType = Literal["modified", "added", "removed", "unchanged", "uncertain"]
NonEmpty = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=3000)]


class ComparisonUploadResponse(BaseModel):
    comparison_id: UUID
    document_a: UploadResponse
    document_b: UploadResponse


class ComparisonRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    comparison_id: UUID
    document_a_id: UUID
    document_b_id: UUID
    instruction: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)
    ]
    scope: Literal["focused", "broad"] = "focused"

    @model_validator(mode="after")
    def distinct_documents(self) -> Self:
        if self.document_a_id == self.document_b_id:
            raise ValueError("Kies twee verschillende document-ID's.")
        return self


class DocumentArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    document_id: Annotated[str, StringConstraints(strict=True, min_length=36, max_length=36)]

    @field_validator("document_id")
    @classmethod
    def valid_uuid(cls, value: str) -> str:
        return str(UUID(value))


class SearchDocumentArgs(DocumentArgs):
    query: Annotated[
        str, StringConstraints(strict=True, strip_whitespace=True, min_length=1, max_length=2000)
    ]
    top_k: int = Field(default=4, ge=1, le=8, strict=True)


class PassageArgs(DocumentArgs):
    passage_id: Annotated[str, StringConstraints(strict=True, min_length=1, max_length=100)]


class FindingDraft(BaseModel):
    model_config = ConfigDict(extra="forbid")
    topic: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
    change_type: ChangeType
    old_situation: NonEmpty
    new_situation: NonEmpty
    explanation: NonEmpty
    source_ids_a: list[str] = Field(max_length=12)
    source_ids_b: list[str] = Field(max_length=12)
    insufficient_evidence: bool


class ComparisonDraft(BaseModel):
    model_config = ConfigDict(extra="forbid")
    summary: NonEmpty
    findings: list[FindingDraft] = Field(max_length=20)


class ComparisonSource(Source):
    document_id: UUID
    filename: str
    reference_id: str


class ComparisonFinding(BaseModel):
    topic: str
    change_type: ChangeType
    proposed_change_type: ChangeType
    old_situation: str
    new_situation: str
    explanation: str
    sources_a: list[ComparisonSource]
    sources_b: list[ComparisonSource]
    insufficient_evidence: bool
    evidence_note: str


class DocumentCoverage(BaseModel):
    document_id: UUID
    filename: str
    total_passages: int
    retrieved_passages: int
    examined_pages: list[int]


class ComparisonToolExecution(ToolExecution):
    document_label: Literal["A", "B"] | None = None


class ComparisonResponse(BaseModel):
    status: Literal["completed", "partial", "insufficient_information", "limit_reached", "error"]
    summary: str
    findings: list[ComparisonFinding] = Field(default_factory=list)
    coverage: list[DocumentCoverage] = Field(default_factory=list)
    all_passages_retrieved: bool = False
    coverage_note: str = (
        "Dit rapport bewijst geen volledige inhoudelijke dekking van beide documenten."
    )
    scope: Literal["focused", "broad"]
    tool_calls: list[ComparisonToolExecution] = Field(default_factory=list, max_length=24)
    tool_call_limit: int
    error: ErrorDetail | None = None
