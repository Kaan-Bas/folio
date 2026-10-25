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
def gemini_client(
    settings: Settings, *, timeout_seconds: float | None = None
) -> Iterator[genai.Client]:
    if not settings.configured:
        raise AppError(
            503,
            "missing_api_key",
            "De LLM is nog niet ingesteld. Configureer de API-sleutel in de backend en herstart de backend.",
        )
    try:
        # Explicit Developer API, bounded timeout in milliseconds, a single attempt, no fallback.
        with genai.Client(
            api_key=settings.gemini_api_key.get_secret_value(),
            vertexai=False,
            http_options=types.HttpOptions(
                timeout=max(
                    1,
                    int(
                        (
                            timeout_seconds
                            if timeout_seconds is not None
                            else settings.gemini_timeout_seconds
                        )
                        * 1000
                    ),
                ),
                retry_options=types.HttpRetryOptions(attempts=1),
            ),
        ) as client:
            yield client
    except errors.APIError as exc:
        if exc.code == 429:
            raise AppError(
                429,
                "provider_rate_limit",
                "De gebruikslimiet van de LLM-provider is bereikt. Probeer later opnieuw of controleer de limieten bij je provider.",
            ) from exc
        if exc.code in (401, 403):
            raise AppError(
                503,
                "invalid_api_key",
                "De API-sleutel voor de LLM is ongeldig of heeft geen toegang. Controleer de sleutel en toegangsrechten bij je provider.",
            ) from exc
        if exc.code in (408, 504):
            raise AppError(
                504, "provider_timeout", "De LLM reageert te langzaam. Probeer opnieuw."
            ) from exc
        raise AppError(
            502,
            "provider_error",
            "De LLM kon de aanvraag niet verwerken. Controleer de modelinstellingen, API-sleutel en modeltoegang, of probeer later opnieuw.",
        ) from exc
    except httpx.TimeoutException as exc:
        raise AppError(
            504, "provider_timeout", "De LLM reageert te langzaam. Probeer opnieuw."
        ) from exc
    except httpx.RequestError as exc:
        raise AppError(
            502,
            "provider_unavailable",
            "De LLM-provider is niet bereikbaar. Controleer je internetverbinding.",
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
                "De LLM gaf geen volledig antwoord of weigerde de aanvraag. Probeer de vraag opnieuw of formuleer deze korter.",
            )
        try:
            return GeneratedAnswer.model_validate_json(response.text)
        except ValidationError as exc:
            raise AppError(
                502,
                "invalid_answer",
                "De LLM gaf een onleesbaar antwoord. Probeer opnieuw.",
            ) from exc


class GeminiAgentModel:
    """Manual function calling: the SDK must never dispatch tools on our behalf."""

    def __init__(
        self,
        settings: Settings,
        *,
        system_prompt: str | None = None,
        tool_specs: dict | None = None,
    ) -> None:
        from app.agent import AGENT_SYSTEM_PROMPT
        from app.agent_tools import TOOL_SPECS

        self.settings = settings
        self.system_prompt = system_prompt if system_prompt is not None else AGENT_SYSTEM_PROMPT
        self.tool_specs = tool_specs if tool_specs is not None else TOOL_SPECS

    def next_turn(
        self, history: Sequence[types.Content], *, remaining_calls: int, timeout_seconds: float
    ) -> types.Content:
        declarations = [
            types.FunctionDeclaration(
                name=name,
                description=description,
                parameters_json_schema=schema.model_json_schema(),
            )
            for name, (schema, description) in self.tool_specs.items()
        ]
        with gemini_client(self.settings, timeout_seconds=timeout_seconds) as client:
            response = client.models.generate_content(
                model=self.settings.gemini_model,
                contents=list(history),
                config=types.GenerateContentConfig(
                    system_instruction=self.system_prompt
                    + f"\nResterend toolbudget: {remaining_calls}. Geef bij nul alleen het eindantwoord.",
                    tools=[types.Tool(function_declarations=declarations)],
                    automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
                    tool_config=types.ToolConfig(
                        function_calling_config=types.FunctionCallingConfig(
                            mode="AUTO" if remaining_calls else "NONE",
                        )
                    ),
                    max_output_tokens=4096,
                ),
            )
        if (
            not response.candidates
            or response.candidates[0].finish_reason != types.FinishReason.STOP
            or not response.candidates[0].content
        ):
            raise AppError(502, "incomplete_answer", "De LLM gaf geen volledige agentrespons.")
        return response.candidates[0].content
