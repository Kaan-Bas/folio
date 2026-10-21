from unittest.mock import Mock

import numpy as np
import pytest

from app.config import ROOT, Settings
from app.embeddings import LocalEmbedder
from app.errors import AppError


@pytest.fixture
def local_model(monkeypatch):
    model = Mock()
    model.encode.side_effect = lambda texts, **_kwargs: np.array(
        [[i + 1, 2] for i, _ in enumerate(texts)], dtype=np.float64
    )
    loader = Mock(return_value=model)
    monkeypatch.setattr("app.embeddings.load_model", loader)
    return model, loader


def test_local_embeddings_load_lazily_once_and_use_role_prefixes(settings, local_model):
    model, loader = local_model
    embedder = LocalEmbedder(settings)
    loader.assert_not_called()
    documents = embedder.embed(["De fiets is blauw.", "De trein is geel."])
    query = embedder.embed(["Welke kleur heeft de fiets?"], is_query=True)
    loader.assert_called_once_with(settings.embedding_model, settings.embedding_cache_dir, False)
    assert model.encode.call_args_list[0].args[0] == [
        "passage: De fiets is blauw.",
        "passage: De trein is geel.",
    ]
    assert model.encode.call_args_list[1].args[0] == ["query: Welke kleur heeft de fiets?"]
    assert model.encode.call_args.kwargs == {
        "batch_size": 32,
        "convert_to_numpy": True,
        "normalize_embeddings": True,
        "show_progress_bar": False,
        "prompt": "",
    }
    assert documents.shape == (2, 2)
    assert query.shape == (1, 2)
    assert documents.dtype == np.float32


def test_model_configuration_is_snapshotted_for_both_index_and_queries(settings, local_model):
    model, loader = local_model
    original_name = settings.embedding_model
    embedder = LocalEmbedder(settings)
    embedder.embed(["Document"])
    settings.embedding_model = "another-model-with-the-same-dimensions"
    settings.embedding_query_prefix = "changed: "
    embedder.embed(["Vraag"], is_query=True)
    assert loader.call_args.args[0] == original_name
    loader.assert_called_once()
    assert model.encode.call_args.args[0] == ["query: Vraag"]


def test_custom_model_prefixes_and_offline_cache(local_model, tmp_path):
    model, loader = local_model
    config = Settings(
        _env_file=None,
        embedding_model="custom/model",
        embedding_cache_dir=tmp_path,
        embedding_local_files_only=True,
        embedding_query_prefix="",
        embedding_document_prefix="",
    )
    embedder = LocalEmbedder(config)
    embedder.embed(["Tekst"], is_query=True)
    loader.assert_called_once_with("custom/model", tmp_path, True)
    assert model.encode.call_args.args[0] == ["Tekst"]


def test_empty_input_does_not_download_weights(settings, local_model):
    _, loader = local_model
    assert LocalEmbedder(settings).embed([]).shape == (0, 0)
    loader.assert_not_called()


def test_download_failure_is_actionable_and_can_be_retried(settings, local_model):
    model, loader = local_model
    loader.side_effect = [OSError("secret network details"), model]
    embedder = LocalEmbedder(settings)
    with pytest.raises(AppError) as error:
        embedder.embed(["Tekst"])
    assert error.value.code == "embedding_model_unavailable"
    assert "eerste download" in error.value.message
    assert "secret" not in error.value.message
    assert embedder.embed(["Tekst"]).shape == (1, 2)


def test_local_inference_failure_is_safe(settings, local_model):
    model, _ = local_model
    model.encode.side_effect = RuntimeError("private text or path")
    with pytest.raises(AppError) as error:
        LocalEmbedder(settings).embed(["Tekst"])
    assert error.value.code == "embedding_failed"
    assert "private" not in error.value.message


def test_relative_cache_path_is_independent_of_working_directory():
    assert (
        Settings(_env_file=None, embedding_cache_dir=".model_cache").embedding_cache_dir
        == ROOT / ".model_cache"
    )
