from __future__ import annotations

import logging
import time
from typing import Any

from fastapi import APIRouter, Depends, Request

from app.config import Settings, get_settings
from app.limiter import limiter
from app.schemas import ParseRequest, ParseResponse, ParsedSchedule, RejectReason
from app.services.ai import (
    default_today,
    match_task_with_ai,
    parse_local_date,
    parse_with_ai,
    resolve_ai_provider,
)
from app.services.conflict import split_schedule_conflicts
from app.services.link_match import resolve_link_target
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


async def _fold_parse_postprocess(
    schedules: list[ParsedSchedule],
    payload: ParseRequest,
    provider: str | None,
    settings: Settings,
) -> tuple[list[ParsedSchedule], list[ParsedSchedule]]:
    """折叠编排：冲突过滤 + linkTask 关联匹配（本地优先，未命中走 AI），回填 taskId。

    把原前端串行的 /conflicts/check 与 /match-task 往返收进单次 /parse 请求；
    同一 linkTask 只匹配一次（多块共享目标时不重复调用 AI）。
    """
    accepted, blocked = split_schedule_conflicts(schedules, payload.existing_blocks)
    resolved: dict[str, str | None] = {}
    for item in accepted:
        if not item.linkTask or not payload.tasks:
            continue
        if item.linkTask not in resolved:
            task_id = resolve_link_target(item.linkTask, payload.tasks)
            if task_id is None and provider:
                try:
                    task_id = await match_task_with_ai(
                        item.linkTask, payload.tasks, provider, settings,
                        api_key=payload.api_key,
                    )
                except Exception:
                    task_id = None
            resolved[item.linkTask] = task_id
        if resolved[item.linkTask]:
            item.taskId = resolved[item.linkTask]
    log_event(
        logger, logging.INFO, "parse.fold",
        accepted=len(accepted),
        blocked=len(blocked),
        linked=sum(1 for item in accepted if item.taskId),
    )
    return accepted, blocked


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
        accepted, blocked = None, None
        if schedules and (payload.tasks or payload.existing_blocks):
            accepted, blocked = await _fold_parse_postprocess(
                schedules, payload, provider, settings
            )
        return ParseResponse(
            source="local",
            schedules=schedules,
            rejected=rejected,
            message=provider_message,
            accepted=accepted,
            blocked=blocked,
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
        accepted, blocked = None, None
        if local_schedules and (payload.tasks or payload.existing_blocks):
            accepted, blocked = await _fold_parse_postprocess(
                local_schedules, payload, provider, settings
            )
        return ParseResponse(
            source="local",
            schedules=local_schedules,
            rejected=local_rejected,
            message="AI 未返回有效结果，已使用本地规则",
            accepted=accepted,
            blocked=blocked,
        )
    _log_parse_result(
        started, source=source, schedules=len(schedules),
        rejected=rejected.code if rejected else None,
    )
    accepted, blocked = None, None
    if schedules and (payload.tasks or payload.existing_blocks):
        accepted, blocked = await _fold_parse_postprocess(
            schedules, payload, provider, settings
        )
    return ParseResponse(
        source=source,  # type: ignore[arg-type]
        schedules=schedules,
        rejected=rejected,
        message=ai_message,
        accepted=accepted,
        blocked=blocked,
    )
