from __future__ import annotations

import logging
import re
import time
from typing import Any

from fastapi import APIRouter, Depends, Request

from app.config import Settings, get_settings
from app.limiter import limiter
from app.schemas import MatchTaskRequest, MatchTaskResponse
from app.services.ai import (
    call_chat_completions,
    parse_model_json,
    resolve_ai_provider,
)
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

    provider, provider_message = resolve_ai_provider(payload.provider, settings)
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
        task_lines = "\n".join(
            f"- ID: {task.id}, 名称: {task.name}" for task in payload.tasks
        )
        system_prompt = (
            "你是任务匹配助手。\n\n"
            "判断时间块活动属于哪个任务。考虑活动的主题、领域和目的，"
            "而不只是看关键词是否完全一样。\n"
            "如果活动与某个任务属于同一主题领域，就返回该任务ID。\n"
            "如果不属于任何任务，返回null。\n\n"
            "注意：taskId 必须是任务列表中的ID字段，不是任务名称。\n\n"
            "只输出JSON，格式：{\"taskId\": \"ID\"} 或 {\"taskId\": null}"
        )
        user_text = (
            f"时间块名称：{payload.name}\n\n"
            f"现有任务列表：\n{task_lines}\n\n"
            "请输出匹配的任务ID，没有匹配则输出null。"
        )
        data = await call_chat_completions(
            system_prompt, user_text, provider, settings,
            temperature=0.5, operation="match_task",
        )
        content = data["choices"][0]["message"]["content"]
        payload_json = parse_model_json(content)
        task_id = (
            payload_json.get("taskId")
            if isinstance(payload_json, dict)
            else None
        )
        if (
            task_id
            and isinstance(task_id, str)
        ):
            # 先按 ID 匹配，再按名称匹配
            matched = next(
                (t for t in payload.tasks if t.id == task_id),
                next(
                    (t for t in payload.tasks if t.name == task_id),
                    None,
                ),
            )
            if matched:
                _log_match_task_result(started, source=provider, matched=True)
                return MatchTaskResponse(source=provider, taskId=matched.id)
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
