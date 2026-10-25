"""Shared manual tool loop: bounded execution, deadlines and original SDK message history."""

import logging
from collections.abc import Callable, Sequence
from time import monotonic
from typing import Protocol

from google.genai import types

from app.agent_tools import ToolResult
from app.errors import AppError

logger = logging.getLogger("uvicorn.error.folio_agent")


class AgentModel(Protocol):
    def next_turn(
        self, history: Sequence[types.Content], *, remaining_calls: int, timeout_seconds: float
    ) -> types.Content: ...


def run_tool_loop(
    model: AgentModel,
    history: list[types.Content],
    *,
    max_calls: int,
    timeout_seconds: float,
    provider_timeout: float,
    check_active: Callable[[], None],
    dispatch: Callable[[str, dict], ToolResult],
    record: Callable[[str, dict, ToolResult], None],
    allowed_names: set[str],
    clock: Callable[[], float] | None = None,
) -> types.Content:
    clock = clock if clock is not None else monotonic
    deadline = clock() + timeout_seconds
    count = 0

    def check() -> float:
        remaining = deadline - clock()
        if remaining <= 0:
            raise AppError(504, "agent_timeout", "De maximale onderzoekstijd is bereikt.")
        check_active()
        return remaining

    while True:
        remaining = check()
        content = model.next_turn(
            history,
            remaining_calls=max_calls - count,
            timeout_seconds=min(remaining, provider_timeout),
        )
        check()
        calls = [part.function_call for part in content.parts or [] if part.function_call]
        if not calls:
            return content
        # Keep opaque thought signatures and all model parts in their original positions.
        history.append(content)
        results = []
        for call in calls:
            check()
            if count >= max_calls:
                raise AppError(429, "tool_limit", f"Maximaal {max_calls} toolaanroepen toegestaan.")
            count += 1
            name, args = call.name or "", call.args or {}
            safe_name = name if name in allowed_names else "unknown_tool"
            try:
                result = (
                    dispatch(name, args)
                    if name in allowed_names
                    else ToolResult("blocked", "Deze tool is niet toegestaan.")
                )
            except Exception as exc:
                record(safe_name, args, ToolResult("error", "De tool kon niet worden uitgevoerd."))
                logger.info("agent_tool name=%s status=error", safe_name)
                if isinstance(exc, AppError):
                    raise
                raise AppError(502, "tool_error", "De tool kon niet worden uitgevoerd.") from exc
            record(safe_name, args, result)
            logger.info("agent_tool name=%s status=%s", safe_name, result.status)
            check()
            results.append(
                types.Part(
                    function_response=types.FunctionResponse(
                        id=call.id,
                        name=name or "unknown_tool",
                        response={"untrusted_tool_result": result.payload()},
                    )
                )
            )
        history.append(types.Content(role="user", parts=results))
