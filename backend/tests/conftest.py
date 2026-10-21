from collections.abc import Sequence
from unittest.mock import Mock

import numpy as np
import pymupdf
import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.llm import GeneratedAnswer
from app.main import create_app


def make_pdf(*texts: str, password: str | None = None) -> bytes:
    with pymupdf.open() as document:
        for text in texts:
            page = document.new_page()
            if text:
                page.insert_text((72, 72), text)
        if password:
            return document.tobytes(
                encryption=pymupdf.PDF_ENCRYPT_AES_256,
                owner_pw=password,
                user_pw=password,
            )
        return document.tobytes()


class FakeEmbedder:
    """Deterministic semantic stand-in; the actual FAISS index still runs in tests."""

    def __init__(self) -> None:
        self.calls: list[list[str]] = []

    def embed(self, texts: Sequence[str], *, is_query: bool = False) -> np.ndarray:
        self.calls.append(list(texts))
        return np.asarray(
            [[1.0, 0.0] if "fiets" in text.lower() else [0.0, 1.0] for text in texts],
            dtype=np.float32,
        )


@pytest.fixture
def settings() -> Settings:
    return Settings(_env_file=None, gemini_api_key="", chunk_size=100, chunk_overlap=20)


@pytest.fixture
def embedder() -> FakeEmbedder:
    return FakeEmbedder()


@pytest.fixture
def generator() -> Mock:
    mock = Mock()
    mock.generate.side_effect = lambda _question, hits: GeneratedAnswer(
        answer="De fiets is blauw.", cited_chunk_ids=[hits[0].chunk.id], sufficient_context=True
    )
    return mock


@pytest.fixture
def client(settings: Settings, embedder: FakeEmbedder, generator: Mock):
    with TestClient(create_app(settings, embedder=embedder, generator=generator)) as test_client:
        yield test_client
