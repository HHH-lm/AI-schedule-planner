from __future__ import annotations

import re
from fastapi import APIRouter, Depends

from app.config import Settings, get_settings
from app.schemas import MatchTaskRequest, MatchTaskResponse
from app.services.ai import (
    call_chat_completions,
    parse_model_json,
    resolve_ai_provider,
)


router = APIRouter()


@router.post("/match-task", response_model=MatchTaskResponse)
async def match_task(
    payload: MatchTaskRequest, settings: Settings = Depends(get_settings)
) -> MatchTaskResponse:
    if not payload.tasks:
        return MatchTaskResponse(source="none", taskId=None)

    def _normalize(text: str) -> str:
        return re.sub(r"[\s\-_.,/]+", "", text).lower()

    provider, provider_message = resolve_ai_provider(payload.provider, settings)
    if not provider:
        normalized_name = _normalize(payload.name)
        for task in payload.tasks:
            if normalized_name in _normalize(task.name) or _normalize(task.name) in normalized_name:
                return MatchTaskResponse(source="local", taskId=task.id)
        return MatchTaskResponse(source="local", taskId=None)

    try:
        ai_result = None
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
            system_prompt, user_text, provider, settings, temperature=0.5
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
                return MatchTaskResponse(source=provider, taskId=matched.id)
    except Exception:
        pass

    # AI 未返回匹配或抛异常时，回退到本地归一化匹配
    normalized_name = _normalize(payload.name)
    for task in payload.tasks:
        if normalized_name in _normalize(task.name) or _normalize(task.name) in normalized_name:
            return MatchTaskResponse(source="local", taskId=task.id)
    return MatchTaskResponse(source="local", taskId=None)
