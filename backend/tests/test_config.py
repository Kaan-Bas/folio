import pytest

from app.config import Settings


def test_gemini_and_local_embedding_environment(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "test-env-key")
    monkeypatch.setenv("GEMINI_MODEL", "configured-model")
    monkeypatch.setenv("EMBEDDING_MODEL", "configured/embedding")
    monkeypatch.setenv("GEMINI_TIMEOUT_SECONDS", "12")
    monkeypatch.setenv("AGENT_TIMEOUT_SECONDS", "60")
    monkeypatch.setenv("COMPARISON_MAX_TOOL_CALLS", "8")
    monkeypatch.setenv("COMPARISON_TIMEOUT_SECONDS", "110")
    monkeypatch.setenv("COMPARISON_MAX_CONTEXT_CHARS", "45000")
    settings = Settings(_env_file=None)
    assert settings.configured
    assert settings.gemini_model == "configured-model"
    assert settings.embedding_model == "configured/embedding"
    assert settings.gemini_timeout_seconds == 12
    assert settings.agent_timeout_seconds == 60
    assert settings.comparison_max_tool_calls == 8
    assert settings.comparison_timeout_seconds == 110
    assert settings.comparison_max_context_chars == 45000
    assert "test-env-key" not in repr(settings)


def test_old_openai_key_does_not_enable_gemini(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "obsolete-test-key")
    settings = Settings(_env_file=None, gemini_api_key=" ")
    assert not settings.configured


def test_dotenv_prefixes_preserve_required_trailing_spaces(tmp_path):
    env_file = tmp_path / ".env"
    env_file.write_text(
        'EMBEDDING_DOCUMENT_PREFIX="passage: "\nEMBEDDING_QUERY_PREFIX="query: "\n',
        encoding="utf-8",
    )
    settings = Settings(_env_file=env_file)
    assert settings.embedding_document_prefix == "passage: "
    assert settings.embedding_query_prefix == "query: "


@pytest.mark.parametrize(
    "values",
    [
        {"gemini_timeout_seconds": 0},
        {"gemini_timeout_seconds": 181},
        {"agent_timeout_seconds": 0},
        {"agent_timeout_seconds": 301},
        {"comparison_max_tool_calls": 1},
        {"comparison_max_tool_calls": 25},
        {"comparison_timeout_seconds": 0},
        {"comparison_timeout_seconds": 301},
        {"comparison_max_context_chars": 3999},
        {"comparison_max_context_chars": 120001},
        {"gemini_model": ""},
        {"embedding_model": ""},
    ],
)
def test_invalid_provider_configuration(values):
    with pytest.raises(ValueError):
        Settings(_env_file=None, **values)
