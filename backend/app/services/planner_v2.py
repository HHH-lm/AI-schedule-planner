"""AI Planning V2 - 结构化规划服务（架构分离：AI 理解 + Python 调度）。

架构：
  LLM 理解层（本模块）                   Rule Engine / SchedulingEngine
  ┌─────────────────────────┐           ┌──────────────────────────────┐
  │ 理解用户目标              │           │ slot_finder: 找空闲时间       │
  │ 拆解任务                  │           │ conflict: 检测冲突            │
  │ 判断任务类型/优先级        │           │ scheduling_engine: 分配任务   │
  │ 估计任务时长              │           │ validator: 校验规划结果      │
  │ 理解自然语言约束          │           │ 根据 Memory 排序候选时段     │
  │ 生成规划解释              │           │ 最终生成可执行时间块         │
  └───────────┬─────────────┘           └──────────────┬───────────────┘
              │                                        │
              └───────────┬────────────────────────────┘
                          ↓
                   Scheduling Engine
                   （合并理解 + 空闲时段 → 最终规划）
                          ↓
                     Validator
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
from app.schemas import ConstraintSpec
from app.services.scheduling_engine import (
    build_constraint_filters,
    parse_constraint_filters,
    schedule_tasks,
)


CATEGORY_VALUES = ("work", "study", "fitness", "life", "rest")


def _build_understanding_prompt(
    goal: str,
    tasks: list[PlanV2Task],
    memories: list[str],
    constraints: list[str],
    existing: list[ExistingBlock],
    range_start: str,
    range_end: str,
) -> str:
    """构建 LLM 理解层 prompt，只要求输出任务理解，不要求输出时间块。"""
    lines: list[str] = [
        "你是高级日程规划助手。根据用户目标、任务、记忆偏好和约束，理解每个任务的性质。",
        "只输出 JSON，不要输出解释。",
        "",
        '格式: {"understandings": [{',
        '  "title": "任务名（必须与输入一致）",',
        '  "category": "work|study|fitness|life|rest",',
        '  "preferred_time": "上午|下午|晚上|any",',
        '  "focus_level": "deep|light|flexible",  # deep=需专注, light=轻松, flexible=均可',
        '  "notes": "对该任务的补充说明"',
        "}]}",
        f"规划范围: {range_start} 至 {range_end}",
        "",
    ]

    if goal:
        lines.append("## 用户目标")
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

    lines.append("## 任务列表")
    for t in tasks:
        deadline = f" 截止: {t.deadline}" if t.deadline else ""
        prio = f" [{t.priority}]"
        lines.append(f"- {t.title} ({t.duration}分钟{prio}{deadline})")
    lines.append("")

    if existing:
        lines.append("## 已有日程")
        for b in existing:
            h = f"{b.start//60:02d}:{b.start%60:02d}-{b.end//60:02d}:{b.end%60:02d}"
            lines.append(f"- {b.date} {h} [{b.status}]")
        lines.append("")

    lines.append("## 理解要求")
    lines.append("1. 根据任务名称和用户目标，判断最适合的 category")
    lines.append("2. 根据任务性质，推荐 preferred_time（上午/下午/晚上/any）")
    lines.append("3. 判断 focus_level：需要专注的任务（如写作、编程）→ deep，轻松的任务（如散步、休息）→ light，其他 → flexible")
    lines.append("4. 如果任务有 deadline，请在 notes 中标注时间紧迫性")
    lines.append("5. 任务 title 必须与输入完全一致，不要修改")
    lines.append("6. 只输出 JSON")
    lines.append("7. 记忆偏好适用于全部任务：记忆明确提到上午/下午/晚上时，所有任务的 preferred_time 都应优先遵循该记忆，除非任务名称明显冲突")

    if constraints:
        lines.append("## 约束解析要求")
        lines.append('8. 若存在约束，请在 JSON 顶层同时输出 "constraints" 字段：')
        lines.append('   {"day_start": 可排最早小时(0-23)或null, "day_end": 可排最晚小时或null, ')
        lines.append('    "exclude_weekdays": [0-6], "exclude_periods": ["上午"/"下午"/"晚上"/"凌晨"], ')
        lines.append('    "max_daily_minutes": 数字或null}')
        lines.append('9. 例："从14:00开始安排" → day_start=14；"周三晚上不能学习" → exclude_weekdays=[2], exclude_periods=["晚上"]')
        lines.append('10. 最终格式：{"understandings": [...], "constraints": {...}}')
        lines.append("")

    return "\n".join(lines)


def _build_explanation_prompt(
    goal: str,
    blocks: list[PlanV2Block],
    unassigned: list[str],
) -> str:
    """构建解释生成 prompt，让 LLM 为规划结果生成自然语言解释。"""
    block_lines = "\n".join(
        f"- {b.date} {b.start//60:02d}:{b.start%60:02d}-{b.end//60:02d}:{b.end%60:02d} {b.title}"
        for b in blocks
    )
    unassigned_lines = "\n".join(f"- {u}" for u in unassigned) if unassigned else "无"

    return "\n".join([
        "你是日程规划解释器。根据用户目标和生成的规划结果，",
        "用一段自然语言解释这个规划（200字以内）。",
        f"用户目标：{goal}",
        "",
        "## 规划结果",
        block_lines,
        "",
        "## 未安排任务",
        unassigned_lines,
        "",
        "要求：",
        "1. 先总结整体安排",
        "2. 说明优先级高的任务安排在什么时段",
        "3. 如有未安排任务，说明原因",
        "4. 语气友好、简洁",
        "5. 只输出解释文本，不要额外格式",
    ])


def _sanitize_understanding(
    raw: Any,
    valid_titles: set[str],
) -> dict[str, Any] | None:
    """校验并清洗 LLM 返回的任务理解。"""
    if not isinstance(raw, dict):
        return None
    title = str(raw.get("title", "")).strip() if raw.get("title") is not None else ""
    if title not in valid_titles:
        return None
    category = raw.get("category") if raw.get("category") in CATEGORY_VALUES else "life"
    preferred_time = raw.get("preferred_time", "any")
    if preferred_time not in ("上午", "下午", "晚上", "any"):
        preferred_time = "any"
    focus_level = raw.get("focus_level", "flexible")
    if focus_level not in ("deep", "light", "flexible"):
        focus_level = "flexible"
    notes = str(raw.get("notes", "")).strip() if raw.get("notes") is not None else ""
    return {
        "title": title,
        "category": category,
        "preferred_time": preferred_time,
        "focus_level": focus_level,
        "notes": notes,
    }


def _fallback_plan_v2(
    tasks: list[PlanV2Task],
    existing: list[ExistingBlock],
    range_start: date,
    range_end: date,
    memories: list[str],
    constraints: list[str] | None = None,
) -> PlanV2Response:
    """本地 fallback 规划器 — 直接使用 SchedulingEngine。"""
    constraint_filters = parse_constraint_filters(constraints or [])
    blocks, unassigned, _issues = schedule_tasks(
        tasks, existing, (range_start, range_end), memories,
        constraint_filters=constraint_filters,
    )
    return PlanV2Response(
        source="local",
        blocks=blocks,
        unassigned=unassigned,
    )


async def plan_v2_schedule(
    request: PlanV2Request,
    settings: Settings,
) -> PlanV2Response:
    """PlanV2 主入口 — 架构分离后的版本。

    流程：
      1. LLM 理解层：理解任务性质（类别、偏好时段、专注度、备注）
      2. SchedulingEngine：Python 调度引擎，根据理解 + 空闲时段分配任务
      3. LLM 解释层：为规划结果生成自然语言解释
    """
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
            request.tasks,
            request.existing_schedule,
            range_start,
            range_end,
            request.memories,
            request.constraints,
        )
        result.message = resolved_message
        return result

    try:
        # ── 步骤 1: LLM 理解层 ──
        understanding_data = await call_chat_completions(
            _build_understanding_prompt(
                request.goal,
                request.tasks,
                request.memories,
                request.constraints,
                request.existing_schedule,
                request.planning_range.start,
                request.planning_range.end,
            ),
            f"请为以下目标理解任务：{request.goal}" if request.goal else "请理解任务",
            resolved_provider,
            settings,
        )
        understanding_content = _extract_content(understanding_data)
        understanding_payload = parse_model_json(understanding_content)
        raw_understandings = (
            understanding_payload.get("understandings")
            if isinstance(understanding_payload, dict)
            else None
        )

        # 校验理解结果
        valid_titles = {t.title for t in request.tasks}
        understandings: list[dict[str, Any]] = []
        if isinstance(raw_understandings, list):
            for raw in raw_understandings:
                cleaned = _sanitize_understanding(raw, valid_titles)
                if cleaned:
                    understandings.append(cleaned)

        # 如果 LLM 理解失败，生成默认理解（用 task 自身信息）
        if not understandings:
            understandings = [
                {
                    "title": t.title,
                    "category": "life",
                    "preferred_time": "any",
                    "focus_level": "flexible",
                    "notes": "",
                }
                for t in request.tasks
            ]

        # ── 步骤 2: SchedulingEngine 调度 ──
        # 从同一次 LLM 理解输出中提取结构化约束（不再二次调用 LLM，避免前端超时）
        spec = None
        if isinstance(understanding_payload, dict) and understanding_payload.get("constraints"):
            try:
                spec = ConstraintSpec.model_validate(understanding_payload["constraints"])
            except Exception:
                spec = None
        llm_filters = build_constraint_filters(spec) if spec else []
        constraint_filters = llm_filters or parse_constraint_filters(request.constraints)
        understandings_dict = {u["title"]: u for u in understandings}
        blocks, unassigned, _issues = schedule_tasks(
            request.tasks,
            request.existing_schedule,
            (range_start, range_end),
            request.memories,
            understandings=understandings_dict,
            constraint_filters=constraint_filters,
        )

        # ── 步骤 3: LLM 解释层（可选） ──
        explanation: str | None = None
        if request.goal and blocks:
            try:
                explanation_data = await call_chat_completions(
                    _build_explanation_prompt(request.goal, blocks, unassigned),
                    "请为这个规划结果生成解释",
                    resolved_provider,
                    settings,
                    temperature=0.7,
                )
                explanation_content = _extract_content(explanation_data)
                explanation = explanation_content.strip()[:500]
            except Exception:
                explanation = None

        return PlanV2Response(
            source=resolved_provider,
            blocks=blocks,
            unassigned=unassigned,
            message=explanation,
        )

    except (httpx.TimeoutException, httpx.ConnectError) as error:
        _ = error
        timeout_seconds = round(settings.ai_timeout_ms / 1000)
        # 超时时回退到 SchedulingEngine
        constraint_filters = parse_constraint_filters(request.constraints)
        blocks, unassigned, _issues = schedule_tasks(
            request.tasks,
            request.existing_schedule,
            (range_start, range_end),
            request.memories,
            constraint_filters=constraint_filters,
        )
        return PlanV2Response(
            source="local",
            blocks=blocks,
            unassigned=unassigned,
            message=f"AI 理解超时（{timeout_seconds} 秒），已使用本地调度引擎",
        )
    except Exception as error:
        # 其他异常时回退到 SchedulingEngine
        try:
            constraint_filters = parse_constraint_filters(request.constraints)
            blocks, unassigned, _issues = schedule_tasks(
                request.tasks,
                request.existing_schedule,
                (range_start, range_end),
                request.memories,
                constraint_filters=constraint_filters,
            )
            return PlanV2Response(
                source="local",
                blocks=blocks,
                unassigned=unassigned,
                message=f"AI 规划失败：{error}，已使用本地调度引擎",
            )
        except Exception as fallback_error:
            return PlanV2Response(
                source="none",
                blocks=[],
                message=f"AI 规划失败：{error}，本地调度也失败：{fallback_error}",
            )
