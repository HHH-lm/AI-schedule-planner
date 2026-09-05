from __future__ import annotations

import logging
import time
from typing import Any

from fastapi import APIRouter, Depends, Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.config import Settings, get_settings
from app.limiter import limiter
from app.schemas import ParseRequest, ParseResponse, RejectReason
from app.services.ai import (
    default_today,
    parse_local_date,
    parse_with_ai,
    resolve_ai_provider,
)
from app.services.nlp import parse_schedule_with_feedback
from app.logging_setup import get_logger, log_event


router = APIRouter()
logger = get_logger("app.api.parse")


def _log_parse_result(
    started: float,
    *,
    source: str,
    schedules: int,
    rejected: str | None,
    level: int = logging.INFO,
    **extra: Any,
) -> None:
    log_event(
        logger,
        level,
        "parse.result",
        duration_ms=round((time.perf_counter() - started) * 1000, 2),
        source=source,
        schedules=schedules,
        rejected=rejected,
        **extra,
    )


@router.post("/parse", response_model=ParseResponse)
@limiter.limit("20/minute")
async def parse_schedule(
    request: Request,
    payload: ParseRequest,
    settings: Settings = Depends(get_settings),
) -> ParseResponse:
    text = payload.text.strip()
    started = time.perf_counter()
    log_event(logger, logging.INFO, "parse.start", text_chars=len(text))
    if not text:
        _log_parse_result(started, source="none", schedules=0, rejected="empty")
        return ParseResponse(
            source="none",
            schedules=[],
            rejected=RejectReason(code="empty", message="输入为空，请输入包含时间和事项的句子"),
        )
    if len(text) > settings.max_parse_input_length:
        _log_parse_result(
            started, source="none", schedules=0, rejected=None,
            level=logging.WARNING, error="input_too_long",
        )
        return ParseResponse(
            source="none",
            schedules=[],
            message=f"输入超过 {settings.max_parse_input_length} 字，已使用本地规则",
        )

    today = payload.today if payload.today and parse_local_date(payload.today) else default_today()
    provider, provider_message = resolve_ai_provider(
        payload.provider, settings, payload.api_key
    )
    if not provider:
        schedules, rejected = parse_schedule_with_feedback(text, parse_local_date(today))
        _log_parse_result(
            started, source="local", schedules=len(schedules),
            rejected=rejected.code if rejected else None,
            reason="no_ai_configured",
        )
        return ParseResponse(
            source="local",
            schedules=schedules,
            rejected=rejected,
            message=provider_message,
        )

    source, schedules, rejected, ai_message = await parse_with_ai(
        text, provider, today, settings, api_key=payload.api_key
    )
    if source == "none":
        _log_parse_result(
            started, source="none", schedules=0,
            rejected=rejected.code if rejected else None,
            level=logging.WARNING, error="ai_unavailable",
        )
        return ParseResponse(source="none", schedules=[], message=ai_message)
    if not schedules and not rejected:
        local_schedules, local_rejected = parse_schedule_with_feedback(
            text, parse_local_date(today)
        )
        _log_parse_result(
            started, source="local", schedules=len(local_schedules),
            rejected=local_rejected.code if local_rejected else None,
            level=logging.WARNING, error="ai_empty_result",
        )
        return ParseResponse(
            source="local",
            schedules=local_schedules,
            rejected=local_rejected,
            message="AI 未返回有效结果，已使用本地规则",
        )
    _log_parse_result(
        started, source=source, schedules=len(schedules),
        rejected=rejected.code if rejected else None,
    )
    return ParseResponse(
        source=source,  # type: ignore[arg-type]
        schedules=schedules,
        rejected=rejected,
        message=ai_message,
    )
