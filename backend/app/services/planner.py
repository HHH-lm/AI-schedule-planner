"""AI 任务拆解与时间规划服务。"""

from __future__ import annotations

import json
import re
from datetime import date, timedelta
from typing import Any

import httpx

from app.config import Settings
from app.schemas import (
    BreakdownResponse,
    BreakdownTask,
    ExistingBlock,
    PlanRequest,
    PlanResponse,
    PlannedBlock,
    PlanTaskInput,
)
from app.services.ai import (
    _extract_content,
    call_chat_completions,
    default_today,
    parse_local_date,
    parse_model_json,
    resolve_ai_provider,
)
from app.services.nlp import guess_category


CATEGORY_VALUES = ("work", "study", "fitness", "life", "rest")


def _split_plan_text(plan: str) -> list[str]:
    parts = re.split(r"[\n,，、;；]+", plan)
    return [part.strip() for part in parts if part.strip()]


def _sanitize_breakdown_task(raw: Any) -> BreakdownTask | None:
    if not isinstance(raw, dict):
        return None
    name = str(raw.get("name", "")).strip() if raw.get("name") is not None else ""
    if not name:
        return None
    subtasks: list[str] = []
    if isinstance(raw.get("subtasks"), list):
        for item in raw["subtasks"]:
            if isinstance(item, str) and item.strip():
                subtasks.append(item.strip()[:80])
                if len(subtasks) >= 10:
                    break
    return BreakdownTask(name=name[:80], subtasks=subtasks)


def _build_breakdown_prompt() -> str:
    return "\n".join(
        [
            "你是项目拆解助手，把中文项目计划拆解为可执行任务列表，只输出 JSON。",
            '格式:{"tasks":[{"name":"任务名","subtasks":["子任务1","子任务2"]}]}',
            "任务数量 1-15，名称简洁具体；每个任务可带 0-5 个子任务。",
            "子任务必须是可直接执行的步骤，不要输出解释。",
        ]
    )


async def breakdown_tasks(
    plan: str,
    provider: str | None,
    today: str | None,
    settings: Settings,
) -> BreakdownResponse:
    plan = plan.strip()
    if not plan:
        return BreakdownResponse(source="none", tasks=[], message="输入为空")

    resolved_provider, resolved_message = resolve_ai_provider(provider, settings)
    if not resolved_provider:
        tasks = [BreakdownTask(name=name) for name in _split_plan_text(plan)]
        return BreakdownResponse(source="local", tasks=tasks, message=resolved_message)

    try:
        anchor = parse_local_date(today) if today else None
        prompt_today = (anchor or date.today()).isoformat()
        user_text = f"今天={prompt_today}。请拆解：\n{plan}"
        data = await call_chat_completions(
            _build_breakdown_prompt(), user_text, resolved_provider, settings
        )
        content = _extract_content(data)
        payload = parse_model_json(content)
        raw_tasks = payload.get("tasks") if isinstance(payload, dict) else None
        if not isinstance(raw_tasks, list) or not raw_tasks:
            raise ValueError("AI 未返回任务列表")
        tasks = [
            item
            for item in ( _sanitize_breakdown_task(raw) for raw in raw_tasks )
            if item is not None
        ][:15]
        if not tasks:
            raise ValueError("AI 返回的任务列表为空")
        return BreakdownResponse(source=resolved_provider, tasks=tasks)
    except (httpx.TimeoutException, httpx.ConnectError) as error:
        _ = error
        timeout_seconds = round(settings.ai_timeout_ms / 1000)
        return BreakdownResponse(
            source="none", tasks=[], message=f"AI 拆解超时（{timeout_seconds} 秒），请稍后重试"
        )
    except Exception as error:
        return BreakdownResponse(source="none", tasks=[], message=f"AI 拆解失败：{error}")


def _build_plan_prompt(
    tasks: list[PlanTaskInput],
    existing: list[ExistingBlock],
    start_date: str,
    end_date: str,
) -> str:
    task_lines = "\n".join(
        f"- {task.name}" + (f"（子任务：{'、'.join(task.subtasks)}）" if task.subtasks else "")
        for task in tasks
    )
    existing_lines = (
        "\n".join(
            f"- {block.date} {block.start}-{block.end} {block.status}"
            for block in existing
        )
        or "无"
    )
    return "\n".join(
        [
            "你是日程规划器，为任务列表生成不冲突的时间块，只输出 JSON。",
            '格式:{"blocks":[{"name":"事项名","date":"YYYY-MM-DD","start":分钟,"end":分钟,'
            '"category":"work|study|fitness|life|rest","location":"地点"}]}',
            f"可排日期：{start_date} 至 {end_date}。",
            "start/end 为当天0点起分钟数，end>start，至少 15 分钟。",
            f"已有时间块：\n{existing_lines}",
            "生成的块不得与已有时间块重叠。",
            f"待排任务：\n{task_lines}",
            "每个任务安排一个时间块；有子任务时可为每个子任务安排独立块。",
            "单块不超过 120 分钟，只输出 JSON。",
        ]
    )


def _sanitize_planned_block(
    raw: Any,
    start: date,
    end: date,
) -> PlannedBlock | None:
    if not isinstance(raw, dict):
        return None
    name = str(raw.get("name", "")).strip() if raw.get("name") is not None else ""
    item_date = str(raw.get("date", "")).strip() if raw.get("date") is not None else ""
    parsed_date = parse_local_date(item_date)
    if not name or not parsed_date or parsed_date < start or parsed_date > end:
        return None
    try:
        block_start = round(float(raw.get("start")))
        block_end = round(float(raw.get("end")))
    except (TypeError, ValueError):
        return None
    safe_start = max(0, min(1439, block_start))
    safe_end = max(safe_start + 15, min(1439, block_end))
    category = raw.get("category") if raw.get("category") in CATEGORY_VALUES else "life"
    location = None
    if isinstance(raw.get("location"), str) and raw["location"].strip():
        location = raw["location"].strip()[:60]
    return PlannedBlock(
        name=name[:80],
        date=item_date,
        start=safe_start,
        end=safe_end,
        category=category,  # type: ignore[arg-type]
        location=location,
    )


def _overlaps(
    occupied: list[ExistingBlock],
    block: PlannedBlock,
) -> bool:
    return any(
        item.date == block.date and item.start < block.end and block.start < item.end
        for item in occupied
    )


def _fallback_plan(
    tasks: list[PlanTaskInput],
    existing: list[ExistingBlock],
    start: date,
    end: date,
) -> list[PlannedBlock]:
    occupied = [block.model_copy() for block in existing]
    blocks: list[PlannedBlock] = []
    for task in tasks:
        subtask_names = task.subtasks or [task.name]
        for subtask_name in subtask_names:
            placed = False
            preferred_date = parse_local_date(task.date) if task.date else None
            day_sequence = (
                [preferred_date] + [start + timedelta(days=n) for n in range((end - start).days + 1)]
                if preferred_date and start <= preferred_date <= end
                else [start + timedelta(days=n) for n in range((end - start).days + 1)]
            )
            for day in day_sequence:
                for minute in range(0, 24 * 60, 30):
                    candidate = PlannedBlock(
                        name=subtask_name[:80],
                        date=day.isoformat(),
                        start=minute,
                        end=minute + 60,
                        category=guess_category(subtask_name),  # type: ignore[arg-type]
                    )
                    if _overlaps(occupied, candidate):
                        continue
                    occupied.append(
                        ExistingBlock(date=candidate.date, start=candidate.start, end=candidate.end)
                    )
                    blocks.append(candidate)
                    placed = True
                    break
                if placed:
                    break
    return blocks


async def plan_schedule(
    request: PlanRequest,
    settings: Settings,
) -> PlanResponse:
    start = parse_local_date(request.start_date) if request.start_date else None
    anchor = parse_local_date(request.today) if request.today else None
    start = start or anchor or date.today()
    end = start + timedelta(days=request.horizon_days - 1)
    start_text = start.isoformat()
    end_text = end.isoformat()

    resolved_provider, resolved_message = resolve_ai_provider(request.provider, settings)
    if not resolved_provider:
        blocks = _fallback_plan(request.tasks, request.existing_blocks, start, end)
        return PlanResponse(source="local", blocks=blocks, blocked=[], message=resolved_message)

    try:
        user_text = f"今天={start_text}。请为这些任务生成时间规划：\n"
        user_text += "\n".join(f"- {task.name}" for task in request.tasks)
        data = await call_chat_completions(
            _build_plan_prompt(request.tasks, request.existing_blocks, start_text, end_text),
            user_text,
            resolved_provider,
            settings,
        )
        content = _extract_content(data)
        payload = parse_model_json(content)
        raw_blocks = payload.get("blocks") if isinstance(payload, dict) else None
        if not isinstance(raw_blocks, list):
            raise ValueError("AI 未返回时间块列表")

        cleaned = [
            item for item in (_sanitize_planned_block(raw, start, end) for raw in raw_blocks)
            if item is not None
        ]
        blocks: list[PlannedBlock] = []
        blocked: list[PlannedBlock] = []
        occupied = [block.model_copy() for block in request.existing_blocks]
        for candidate in cleaned:
            if _overlaps(occupied, candidate):
                blocked.append(candidate)
                continue
            occupied.append(
                ExistingBlock(date=candidate.date, start=candidate.start, end=candidate.end)
            )
            blocks.append(candidate)
        if not blocks:
            raise ValueError("AI 生成的时间块全部与已有安排冲突")
        return PlanResponse(source=resolved_provider, blocks=blocks, blocked=blocked)
    except (httpx.TimeoutException, httpx.ConnectError) as error:
        _ = error
        timeout_seconds = round(settings.ai_timeout_ms / 1000)
        return PlanResponse(
            source="none", blocks=[], blocked=[], message=f"AI 规划超时（{timeout_seconds} 秒），请稍后重试"
        )
    except Exception as error:
        return PlanResponse(source="none", blocks=[], blocked=[], message=f"AI 规划失败：{error}")
