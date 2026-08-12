"""AI Planning V2 - 结构化规划服务。

Planning Context:
  goal + tasks (priority/duration/deadline) + memories + constraints
  + existing_schedule + planning_range
  -> scheduled blocks

核心原则:
  1. AI 负责理解上下文、权衡优先级、尊重记忆和约束
  2. 本地 fallback 提供基础排期能力
  3. 输出结构化 block 列表，不含自然语言解释
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any

import httpx

from app.config import Settings
from app.schemas import (
    ExistingBlock,
    PlanV2Block,
    PlanV2Request,
    PlanV2Response,
    PlanV2Task,
    PlanningRange,
)
from app.services.ai import (
    _extract_content,
    call_chat_completions,
    parse_local_date,
    parse_model_json,
    resolve_ai_provider,
)
from app.services.nlp import guess_category


CATEGORY_VALUES = ("work", "study", "fitness", "life", "rest")
PRIORITY_SCORE: dict[str, int] = {"high": 3, "medium": 2, "low": 1}


def _build_plan_v2_prompt(
    goal: str,
    tasks: list[PlanV2Task],
    memories: list[str],
    constraints: list[str],
    existing: list[ExistingBlock],
    range_start: str,
    range_end: str,
) -> str:
    lines: list[str] = [
        "你是高级日程规划助手。根据用户目标、任务、记忆偏好和约束，生成最优时间安排。",
        "只输出 JSON，不要输出解释。",
        '格式: {"blocks": [{"title":"事项名","date":"YYYY-MM-DD","start":分钟,"end":分钟,"category":"work|study|fitness|life|rest","priority":"high|medium|low"}]}',
        f"规划范围: {range_start} 至 {range_end}",
        "start/end 为当天0点起分钟数，end > start，至少15分钟。",
        "",
    ]

    if goal:
        lines.append(f"## 用户目标")
        lines.append(goal)
        lines.append("")

    if memories:
        lines.append("## 用户偏好与习惯")
        for m in memories:
            lines.append(f"- {m}")
        lines.append("")

    if constraints:
        lines.append("## 约束条件")
        for c in constraints:
            lines.append(f"- {c}")
        lines.append("")

    lines.append("## 任务列表（按优先级排序）")
    sorted_tasks = sorted(tasks, key=lambda t: -PRIORITY_SCORE.get(t.priority, 2))
    for t in sorted_tasks:
        deadline = f" 截止: {t.deadline}" if t.deadline else ""
        lines.append(f"- {t.title} ({t.duration}分钟, {t.priority}{deadline})")
    lines.append("")

    if existing:
        lines.append("## 已有日程")
        for b in existing:
            h = f"{b.start//60:02d}:{b.start%60:02d}-{b.end//60:02d}:{b.end%60:02d}"
            lines.append(f"- {b.date} {h} [{b.status}]")
        lines.append("")

    lines.append("## 规划要求")
    lines.append("1. 高优先级任务优先安排在用户精力最好的时段")
    lines.append("2. 尊重用户偏好和约束条件")
    lines.append("3. 同一天同类任务尽量连续安排，避免碎片化")
    lines.append("4. 每个任务独立安排一个时间块，duration 作为参考时长")
    lines.append("5. 已有日程不可覆盖")
    lines.append("6. 无法安排的任务排除在 blocks 外，放入 unassigned 列表")
    lines.append("7. 只输出 JSON")

    return "\n".join(lines)


def _sanitize_plan_v2_block(
    raw: Any,
    start: date,
    end: date,
) -> PlanV2Block | None:
    if not isinstance(raw, dict):
        return None
    title = str(raw.get("title", "")).strip() if raw.get("title") is not None else ""
    block_date = str(raw.get("date", "")).strip() if raw.get("date") is not None else ""
    parsed = parse_local_date(block_date)
    if not title or not parsed or parsed < start or parsed > end:
        return None
    try:
        block_start = round(float(raw.get("start")))
        block_end = round(float(raw.get("end")))
    except (TypeError, ValueError):
        return None
    safe_start = max(0, min(1439, block_start))
    safe_end = max(safe_start + 15, min(1439, block_end))
    category = raw.get("category") if raw.get("category") in CATEGORY_VALUES else "life"
    priority = raw.get("priority") if raw.get("priority") in ("high", "medium", "low") else "medium"
    return PlanV2Block(
        title=title[:80],
        date=block_date,
        start=safe_start,
        end=safe_end,
        category=category,  # type: ignore[arg-type]
        priority=priority,  # type: ignore[arg-type]
    )


def _overlaps(
    occupied: list[ExistingBlock],
    block: PlanV2Block,
) -> bool:
    return any(
        item.date == block.date and item.start < block.end and block.start < item.end
        for item in occupied
    )


def _fallback_plan_v2(
    tasks: list[PlanV2Task],
    existing: list[ExistingBlock],
    range_start: date,
    range_end: date,
    memories: list[str],
) -> PlanV2Response:
    """本地 fallback 规划器。

    按优先级排序，为每个任务找第一个可用时段。
    偏好上午（6:00-12:00）安排高优先级任务。
    """
    occupied = [b.model_copy() for b in existing]
    blocks: list[PlanV2Block] = []
    unassigned: list[str] = []

    sorted_tasks = sorted(tasks, key=lambda t: -PRIORITY_SCORE.get(t.priority, 2))

    for task in sorted_tasks:
        placed = False
        day_count = (range_end - range_start).days + 1
        days = [range_start + timedelta(days=n) for n in range(day_count)]

        # 优先在截止日前安排
        deadline = parse_local_date(task.deadline) if task.deadline else None
        if deadline:
            days = [d for d in days if d <= deadline]
            if not days:
                days = [range_start + timedelta(days=n) for n in range(day_count)]

        # 高优先级任务优先尝试上午时段
        time_slots = (
            [(6 * 60, 12 * 60), (12 * 60, 18 * 60), (18 * 60, 22 * 60)]
            if task.priority == "high"
            else [(12 * 60, 18 * 60), (6 * 60, 12 * 60), (18 * 60, 22 * 60)]
        )

        for day in days:
            for slot_start, slot_end in time_slots:
                for minute in range(slot_start, slot_end - task.duration + 1, 15):
                    candidate = PlanV2Block(
                        title=task.title[:80],
                        date=day.isoformat(),
                        start=minute,
                        end=minute + task.duration,
                        category=guess_category(task.title),  # type: ignore[arg-type]
                        priority=task.priority,  # type: ignore[arg-type]
                    )
                    if _overlaps(occupied, candidate):
                        continue
                    occupied.append(
                        ExistingBlock(
                            date=candidate.date,
                            start=candidate.start,
                            end=candidate.end,
                        )
                    )
                    blocks.append(candidate)
                    placed = True
                    break
                if placed:
                    break
            if placed:
                break

        if not placed:
            unassigned.append(task.title)

    return PlanV2Response(
        source="local",
        blocks=blocks,
        unassigned=unassigned,
    )


async def plan_v2_schedule(
    request: PlanV2Request,
    settings: Settings,
) -> PlanV2Response:
    """PlanV2 主入口。"""
    range_start = parse_local_date(request.planning_range.start)
    range_end = parse_local_date(request.planning_range.end)
    if not range_start or not range_end or range_end < range_start:
        return PlanV2Response(
            source="none",
            blocks=[],
            message="规划范围无效",
        )

    resolved_provider, resolved_message = resolve_ai_provider(
        request.provider, settings
    )
    if not resolved_provider:
        result = _fallback_plan_v2(
            request.tasks, request.existing_schedule, range_start, range_end, request.memories
        )
        result.message = resolved_message
        return result

    try:
        user_text = f"请为以下目标生成时间规划：{request.goal}" if request.goal else "请生成时间规划"
        data = await call_chat_completions(
            _build_plan_v2_prompt(
                request.goal,
                request.tasks,
                request.memories,
                request.constraints,
                request.existing_schedule,
                request.planning_range.start,
                request.planning_range.end,
            ),
            user_text,
            resolved_provider,
            settings,
        )
        content = _extract_content(data)
        payload = parse_model_json(content)
        raw_blocks = payload.get("blocks") if isinstance(payload, dict) else None
        raw_unassigned = payload.get("unassigned") if isinstance(payload, dict) else None

        if not isinstance(raw_blocks, list):
            raise ValueError("AI 未返回时间块列表")

        cleaned = [
            item
            for item in (
                _sanitize_plan_v2_block(raw, range_start, range_end)
                for raw in raw_blocks
            )
            if item is not None
        ]
        blocks: list[PlanV2Block] = []
        occupied = [b.model_copy() for b in request.existing_schedule]
        for candidate in cleaned:
            if _overlaps(occupied, candidate):
                continue
            occupied.append(
                ExistingBlock(date=candidate.date, start=candidate.start, end=candidate.end)
            )
            blocks.append(candidate)

        unassigned: list[str] = []
        if isinstance(raw_unassigned, list):
            unassigned = [str(u) for u in raw_unassigned if isinstance(u, str)]

        return PlanV2Response(
            source=resolved_provider,
            blocks=blocks,
            unassigned=unassigned,
        )
    except (httpx.TimeoutException, httpx.ConnectError):
        timeout_seconds = round(settings.ai_timeout_ms / 1000)
        return PlanV2Response(
            source="none",
            blocks=[],
            message=f"AI 规划超时（{timeout_seconds} 秒），请稍后重试",
        )
    except Exception as error:
        return PlanV2Response(
            source="none",
            blocks=[],
            message=f"AI 规划失败：{error}",
        )
