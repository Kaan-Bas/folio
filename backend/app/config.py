from pathlib import Path
from typing import Self

from pydantic import Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    # Resolve from this file so starting Uvicorn from backend/ also finds the root .env.
    model_config = SettingsConfigDict(env_file=ROOT / ".env", extra="ignore")

    gemini_api_key: SecretStr = SecretStr("")
    gemini_model: str = Field(default="gemini-3.5-flash-lite", min_length=1)
    gemini_timeout_seconds: float = Field(default=45, gt=0, le=180)
    agent_timeout_seconds: float = Field(default=90, gt=0, le=300)
    comparison_max_tool_calls: int = Field(default=12, ge=2, le=24)
    comparison_timeout_seconds: float = Field(default=120, gt=0, le=300)
    comparison_max_context_chars: int = Field(default=60000, ge=4000, le=120000)
    embedding_model: str = Field(default="intfloat/multilingual-e5-small", min_length=1)
    embedding_cache_dir: Path = ROOT / ".model_cache"
    embedding_local_files_only: bool = False
    embedding_document_prefix: str = "passage: "
    embedding_query_prefix: str = "query: "
    chunk_size: int = Field(default=1200, ge=50, le=4000)
    chunk_overlap: int = Field(default=200, ge=0)
    top_k: int = Field(default=4, ge=1, le=12)
    min_similarity: float = Field(default=0.2, ge=-1, le=1)
    max_upload_mb: int = Field(default=10, ge=1, le=50)
    max_pages: int = Field(default=200, ge=1)
    max_extracted_chars: int = Field(default=1_000_000, ge=1)
    max_chunks: int = Field(default=2000, ge=1)
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]

    @model_validator(mode="after")
    def validate_overlap(self) -> Self:
        if self.chunk_overlap >= self.chunk_size:
            raise ValueError("CHUNK_OVERLAP moet kleiner zijn dan CHUNK_SIZE.")
        if not self.embedding_cache_dir.is_absolute():
            self.embedding_cache_dir = ROOT / self.embedding_cache_dir
        return self

    @property
    def configured(self) -> bool:
        return bool(self.gemini_api_key.get_secret_value().strip())
