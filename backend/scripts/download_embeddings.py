"""Download/cache the configured embedding model and check CPU inference, without Gemini."""

from app.config import Settings
from app.embeddings import LocalEmbedder


def main() -> None:
    settings = Settings()
    embedder = LocalEmbedder(settings)
    document = embedder.embed(["De fiets is blauw."])
    query = embedder.embed(["Welke kleur heeft de fiets?"], is_query=True)
    if document.shape != query.shape:
        raise RuntimeError("Index- en query-embeddings hebben verschillende dimensies.")
    print(f"Model gereed: {settings.embedding_model}")
    print(f"Modelcache: {settings.embedding_cache_dir}")
    print(f"Document- en queryvector: {document.shape}; Gemini is niet aangeroepen.")


if __name__ == "__main__":
    main()
