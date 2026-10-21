from uuid import UUID

from pydantic import BaseModel, Field, field_validator

MAX_QUESTION_CHARS = 2000


class ErrorDetail(BaseModel):
    code: str
    message: str


class ErrorResponse(BaseModel):
    error: ErrorDetail


class HealthResponse(BaseModel):
    status: str = "ok"
    configured: bool
    max_upload_mb: int
    max_question_chars: int = MAX_QUESTION_CHARS


class UploadResponse(BaseModel):
    document_id: UUID
    filename: str
    page_count: int
    text_page_count: int
    chunk_count: int


class QuestionRequest(BaseModel):
    document_id: UUID
    question: str = Field(min_length=1, max_length=MAX_QUESTION_CHARS)

    @field_validator("question")
    @classmethod
    def strip_question(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Stel een vraag met minimaal één teken.")
        return value


class Source(BaseModel):
    chunk_id: str
    page: int
    text: str
    score: float


class QuestionResponse(BaseModel):
    answer: str
    sources: list[Source]
    insufficient_context: bool
