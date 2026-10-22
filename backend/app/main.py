import logging
from typing import Annotated

from fastapi import FastAPI, File, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool
from starlette.exceptions import HTTPException

from app.agent import AgentModel, AgentService
from app.agent_schemas import AgentRequest, AgentResponse
from app.config import Settings
from app.embeddings import Embedder, LocalEmbedder
from app.errors import AppError
from app.gemini import GeminiAgentModel, GeminiAnswerGenerator
from app.llm import AnswerGenerator
from app.schemas import (
    ErrorResponse,
    HealthResponse,
    QuestionRequest,
    QuestionResponse,
    UploadResponse,
)
from app.service import RAGService

logger = logging.getLogger(__name__)


def error_response(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(status_code=status, content={"error": {"code": code, "message": message}})


def create_app(
    settings: Settings | None = None,
    *,
    embedder: Embedder | None = None,
    generator: AnswerGenerator | None = None,
    agent_model: AgentModel | None = None,
) -> FastAPI:
    config = settings if settings is not None else Settings()
    service = RAGService(
        config,
        embedder if embedder is not None else LocalEmbedder(config),
        generator if generator is not None else GeminiAnswerGenerator(config),
    )
    app = FastAPI(
        title="PDF Knowledge Assistant",
        version="0.1.0",
        responses={
            status: {"model": ErrorResponse}
            for status in (400, 404, 409, 413, 415, 422, 429, 500, 502, 503, 504)
        },
    )
    app.state.rag = service
    app.state.agent = AgentService(
        service,
        agent_model if agent_model is not None else GeminiAgentModel(config),
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=config.cors_origins,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type"],
    )

    @app.exception_handler(AppError)
    async def handle_app_error(_request: Request, exc: AppError) -> JSONResponse:
        return error_response(exc.status_code, exc.code, exc.message)

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(
        _request: Request, _exc: RequestValidationError
    ) -> JSONResponse:
        return error_response(
            422,
            "validation_error",
            "Controleer je aanvraag: kies een PDF en stel een niet-lege vraag van maximaal 2000 tekens met een geldige document-ID.",
        )

    @app.exception_handler(HTTPException)
    async def handle_http_error(_request: Request, exc: HTTPException) -> JSONResponse:
        return error_response(
            exc.status_code, "http_error", "De aanvraag of het adres is ongeldig."
        )

    @app.exception_handler(Exception)
    async def handle_unexpected_error(_request: Request, exc: Exception) -> JSONResponse:
        # Do not log request bodies, document text, keys or provider exception messages.
        logger.error("Unexpected backend error: %s", type(exc).__name__)
        return error_response(
            500, "internal_error", "Er ging iets mis bij het verwerken. Probeer opnieuw."
        )

    @app.get("/api/health", response_model=HealthResponse)
    def health() -> HealthResponse:
        return HealthResponse(configured=config.configured, max_upload_mb=config.max_upload_mb)

    @app.post("/api/documents", response_model=UploadResponse, status_code=201)
    async def upload(file: Annotated[UploadFile, File()]) -> UploadResponse:
        revision = service.store.begin_upload()
        try:
            filename = (file.filename or "").replace("\\", "/").split("/")[-1]
            if not filename.lower().endswith(".pdf") or file.content_type not in (
                "application/pdf",
                "application/octet-stream",
                None,
            ):
                raise AppError(
                    415, "unsupported_file", "Kies een PDF-bestand met de extensie .pdf."
                )
            limit = config.max_upload_mb * 1024 * 1024
            data = await file.read(limit + 1)
            if len(data) > limit:
                raise AppError(
                    413,
                    "file_too_large",
                    f"De PDF mag maximaal {config.max_upload_mb} MB groot zijn.",
                )
            if not data:
                raise AppError(400, "empty_file", "Dit bestand is leeg. Kies een PDF met tekst.")
            # PDF/FAISS work and synchronous SDK calls must not block the ASGI event loop.
            return await run_in_threadpool(service.ingest, data, filename, revision)
        finally:
            await file.close()

    @app.post("/api/questions", response_model=QuestionResponse)
    def ask(request: QuestionRequest) -> QuestionResponse:
        return service.ask(request)

    @app.post("/api/agent", response_model=AgentResponse)
    def investigate(request: AgentRequest) -> AgentResponse:
        return app.state.agent.run(request)

    return app


app = create_app()
