from __future__ import annotations

import logging
import re
import time
from typing import Any

from fastapi import APIRouter, Depends, Request

from app.config import Settings, get_settings
from app.limiter import limiter
from app.schemas import MatchTaskRequest, MatchTaskResponse
from app.services.ai import match_task_with_ai, resolve_ai_provider
from app.logging_setup import get_logger, log_event


router = APIRouter()
logger = get_logger("app.api.match_task")


def _log_match_task_result(
    started: float,
    *,
    source: str,
    matched: bool,
    level: int = logging.INFO,
    **extra: Any,
) -> None:
    log_event(
        logger,
        level,
        "match_task.result",
        duration_ms=round((time.perf_counter() - started) * 1000, 2),
        source=source,
        matched=matched,
        **extra,
    )


@router.post("/match-task", response_model=MatchTaskResponse)
@limiter.limit("20/minute")
async def match_task(
    request: Request,
    payload: MatchTaskRequest,
    settings: Settings = Depends(get_settings),
) -> MatchTaskResponse:
    started = time.perf_counter()
    log_event(
        logger,
        logging.INFO,
        "match_task.start",
        tasks=len(payload.tasks),
        name_chars=len(payload.name),
    )
    if not payload.tasks:
        _log_match_task_result(started, source="none", matched=False)
        return MatchTaskResponse(source="none", taskId=None)

    def _normalize(text: str) -> str:
        return re.sub(r"[\s\-_.,/]+", "", text).lower()

    provider, provider_message = resolve_ai_provider(
        payload.provider, settings, payload.api_key
    )
    if not provider:
        normalized_name = _normalize(payload.name)
        for task in payload.tasks:
            if normalized_name in _normalize(task.name) or _normalize(task.name) in normalized_name:
                _log_match_task_result(
                    started, source="local", matched=True, reason="no_ai_configured"
                )
                return MatchTaskResponse(source="local", taskId=task.id)
        _log_match_task_result(
            started, source="local", matched=False, reason="no_ai_configured"
        )
        return MatchTaskResponse(source="local", taskId=None)

    try:
        matched_id = await match_task_with_ai(
            payload.name, payload.tasks, provider, settings,
            api_key=payload.api_key,
        )
        if matched_id:
            _log_match_task_result(started, source=provider, matched=True)
            return MatchTaskResponse(source=provider, taskId=matched_id)
    except Exception as error:
        log_event(
            logger,
            logging.ERROR,
            "match_task.error",
            error=str(error)[:200],
            duration_ms=round((time.perf_counter() - started) * 1000, 2),
        )

    # AI 未返回匹配或抛异常时，回退到本地归一化匹配
    normalized_name = _normalize(payload.name)
    for task in payload.tasks:
        if normalized_name in _normalize(task.name) or _normalize(task.name) in normalized_name:
            _log_match_task_result(
                started, source="local", matched=True, reason="ai_no_match"
            )
            return MatchTaskResponse(source="local", taskId=task.id)
    _log_match_task_result(
        started, source="local", matched=False, reason="ai_no_match"
    )
    return MatchTaskResponse(source="local", taskId=None)
