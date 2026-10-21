"""All Gemini SDK interaction lives here; the RAG service depends only on AnswerGenerator."""

import json
from collections.abc import Iterator, Sequence
from contextlib import contextmanager

import httpx
from google import genai
from google.genai import errors, types
from pydantic import ValidationError

from app.config import Settings
from app.errors import AppError
from app.llm import SYSTEM_PROMPT, GeneratedAnswer
from app.retrieval import SearchHit


@contextmanager
def gemini_client(settings: Settings) -> Iterator[genai.Client]:
    if not settings.configured:
        raise AppError(
            503,
            "missing_api_key",
            "Vul GEMINI_API_KEY in de .env van de backend in en herstart de backend.",
        )
    try:
        # Explicit Developer API, bounded timeout in milliseconds, a single attempt, no fallback.
        with genai.Client(
            api_key=settings.gemini_api_key.get_secret_value(),
            vertexai=False,
            http_options=types.HttpOptions(
                timeout=int(settings.gemini_timeout_seconds * 1000),
                retry_options=types.HttpRetryOptions(attempts=1),
            ),
        ) as client:
            yield client
    except errors.APIError as exc:
        if exc.code == 429:
            raise AppError(
                429,
                "provider_rate_limit",
                "Het Gemini-quotum is bereikt. Controleer de limieten in Google AI Studio en probeer later opnieuw. Er wordt geen fallbackprovider gebruikt.",
            ) from exc
        if exc.code in (401, 403):
            raise AppError(
                503,
                "invalid_api_key",
                "De Gemini API-sleutel is ongeldig of heeft geen toegang. Controleer je sleutel en project in Google AI Studio.",
            ) from exc
        if exc.code in (408, 504):
            raise AppError(
                504, "provider_timeout", "Gemini reageert te langzaam. Probeer opnieuw."
            ) from exc
        raise AppError(
            502,
            "provider_error",
            "Gemini kon de aanvraag niet verwerken. Controleer GEMINI_MODEL, de API-sleutel en modeltoegang in Google AI Studio, of probeer later opnieuw.",
        ) from exc
    except httpx.TimeoutException as exc:
        raise AppError(
            504, "provider_timeout", "Gemini reageert te langzaam. Probeer opnieuw."
        ) from exc
    except httpx.RequestError as exc:
        raise AppError(
            502,
            "provider_unavailable",
            "Gemini is niet bereikbaar. Controleer je internetverbinding.",
        ) from exc


class GeminiAnswerGenerator:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def generate(self, question: str, hits: Sequence[SearchHit]) -> GeneratedAnswer:
        payload = {
            "question": question,
            "untrusted_pdf_fragments": [
                {"id": hit.chunk.id, "page": hit.chunk.page, "text": hit.chunk.text} for hit in hits
            ],
        }
        with gemini_client(self.settings) as client:
            response = client.models.generate_content(
                model=self.settings.gemini_model,
                contents=types.Content(
                    role="user",
                    parts=[
                        types.Part.from_text(text=json.dumps(payload, ensure_ascii=False)),
                    ],
                ),
                config=types.GenerateContentConfig(
                    system_instruction=SYSTEM_PROMPT,
                    response_mime_type="application/json",
                    response_json_schema=GeneratedAnswer.model_json_schema(),
                    max_output_tokens=2048,
                ),
            )
        if (
            not response.candidates
            or response.candidates[0].finish_reason != types.FinishReason.STOP
            or not response.text
        ):
            raise AppError(
                502,
                "incomplete_answer",
                "Gemini gaf geen volledig antwoord of weigerde de aanvraag. Probeer de vraag opnieuw of formuleer deze korter.",
            )
        try:
            return GeneratedAnswer.model_validate_json(response.text)
        except ValidationError as exc:
            raise AppError(
                502,
                "invalid_answer",
                "Gemini gaf een onleesbaar antwoord. Probeer opnieuw.",
            ) from exc
