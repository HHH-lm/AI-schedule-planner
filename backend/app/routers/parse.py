from __future__ import annotations

from fastapi import APIRouter, Depends

from app.config import Settings, get_settings
from app.schemas import ParseRequest, ParseResponse, RejectReason
from app.services.ai import (
    default_today,
    parse_local_date,
    parse_with_ai,
    resolve_ai_provider,
)
from app.services.nlp import parse_schedule_with_feedback


router = APIRouter()


@router.post("/parse", response_model=ParseResponse)
async def parse_schedule(
    payload: ParseRequest, settings: Settings = Depends(get_settings)
) -> ParseResponse:
    text = payload.text.strip()
    if not text:
        return ParseResponse(
            source="none",
            schedules=[],
            rejected=RejectReason(code="empty", message="输入为空，请输入包含时间和事项的句子"),
        )
    if len(text) > settings.max_parse_input_length:
        return ParseResponse(
            source="none",
            schedules=[],
            message=f"输入超过 {settings.max_parse_input_length} 字，已使用本地规则",
        )

    today = payload.today if payload.today and parse_local_date(payload.today) else default_today()
    provider, provider_message = resolve_ai_provider(payload.provider, settings)
    if not provider:
        schedules, rejected = parse_schedule_with_feedback(text, parse_local_date(today))
        return ParseResponse(
            source="local",
            schedules=schedules,
            rejected=rejected,
            message=provider_message,
        )

    source, schedules, rejected, ai_message = await parse_with_ai(
        text, provider, today, settings
    )
    if source == "none":
        return ParseResponse(source="none", schedules=[], message=ai_message)
    if not schedules and not rejected:
        local_schedules, local_rejected = parse_schedule_with_feedback(
            text, parse_local_date(today)
        )
        return ParseResponse(
            source="local",
            schedules=local_schedules,
            rejected=local_rejected,
            message="AI 未返回有效结果，已使用本地规则",
        )
    return ParseResponse(
        source=source,  # type: ignore[arg-type]
        schedules=schedules,
        rejected=rejected,
        message=ai_message,
    )
