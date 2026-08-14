"""调度引擎 — 负责将任务分配到最佳空闲时段。

架构定位：
  ┌─ LLM 理解层 ──┐   ┌─ Rule Engine ────────┐
  │ 输出任务理解     │   │ 找空闲时间（slot_finder）│
  │（类别/偏好/备注） │   │ 冲突检测（conflict）    │
  └────────────────┘   └────────────────────┘
          ↓                      ↓
          └──────┬───────────────┘
                 ↓
          Scheduling Engine（本模块）
          SlotScorer 七维评分：
            Memory匹配度  × 0.25
            + 理解匹配度   × 0.10
            + 时间可用性   × 0.20
            + 任务优先级   × 0.15
            + 截止日期     × 0.10
            - 冲突风险     × 0.10
            - 负荷惩罚     × 0.10
                 ↓
          → 选最高分 → Final Plan
                 ↓
            Validator（validator）
"""

from __future__ import annotations

import re
from datetime import date, timedelta
from typing import Any

from app.schemas import ExistingBlock, PlanV2Block, PlanV2Task
from app.services.ai import parse_local_date
from app.services.conflict import overlaps_with_any
from app.services.nlp import guess_category
from app.services.slot_finder import (
    DEFAULT_DAY_END,
    DEFAULT_DAY_START,
    FreeSlot,
    find_free_slots,
    filter_slots_by_duration,
)
from app.services.validator import validate_plan_v2


# ── 星期映射 ──
WEEKDAY_NAMES: dict[str, int] = {
    "周一": 0, "星期一": 0, "周二": 1, "星期二": 1,
    "周三": 2, "星期三": 2, "周四": 3, "星期四": 3,
    "周五": 4, "星期五": 4, "周六": 5, "星期六": 5,
    "周日": 6, "星期日": 6,
}


def parse_constraint_filters(
    constraints: list[str],
) -> list[Any]:
    """解析自然语言约束为 slot 过滤函数列表。

    支持的格式：
      - "不要安排在周三" / "避开周三" → 排除特定星期
      - "不要安排在晚上" / "避开晚上" → 排除特定时段
      - "下午三点前" / "15点前" → 排除某个时间点之后
      - "三点后" / "15点后" → 排除某个时间点之前

    Returns:
        list of callables, 每个 callable 接受 FreeSlot 返回 bool
        (True = 允许该时段)
    """
    filters: list[Any] = []

    for text in constraints:
        text_stripped = text.strip()
        if not text_stripped:
            continue

        # 排除特定星期： "不要周三" / "避开周三" / "周三不可"
        detected_weekday: int | None = None
        for name, weekday in WEEKDAY_NAMES.items():
            if name in text_stripped and any(
                kw in text_stripped for kw in ("不要", "避开", "跳过", "不安排", "不可", "不行", "不能")
            ):
                detected_weekday = weekday
                break

        # 排除特定时段： "不要晚上" / "避开晚上"
        detected_period: str | None = None
        for period_kw, period_label in [
            ("凌晨", "凌晨"), ("上午", "上午"), ("下午", "下午"), ("晚上", "晚上"),
        ]:
            if period_kw in text_stripped and any(
                kw in text_stripped for kw in ("不要", "避开", "跳过", "不安排", "不可", "不行", "不能")
            ):
                detected_period = period_label
                break

        # 如果同时检测到星期和时段，创建组合过滤器（AND 逻辑）
        if detected_weekday is not None and detected_period is not None:
            filters.append(_make_combined_weekday_period_filter(detected_weekday, detected_period, exclude=True))
        else:
            if detected_weekday is not None:
                filters.append(_make_weekday_filter(detected_weekday, exclude=True))
            if detected_period is not None:
                filters.append(_make_period_filter(detected_period, exclude=True))

        # "X点前" 或 "X点后"（支持中文数字和阿拉伯数字，支持上午/下午前缀）
        hour = None
        direction = None
        # 先尝试阿拉伯数字
        time_match = re.search(r"(\d+)\s*点\s*(前|后)", text_stripped)
        if time_match:
            hour = int(time_match.group(1))
            direction = time_match.group(2)
        else:
            # 尝试中文数字
            cn_match = re.search(r"([一二三四五六七八九十\d]+)\s*点\s*(前|后)", text_stripped)
            if cn_match:
                cn_hour = _parse_chinese_number(cn_match.group(1))
                if cn_hour is not None:
                    hour = cn_hour
                    direction = cn_match.group(2)
        if hour is not None and direction:
            # 处理"下午X点" → +12小时，变为 15:00（下午三点 = 15:00）
            if "下午" in text_stripped and 1 <= hour <= 11:
                hour += 12
            if direction == "前":
                filters.append(_make_time_before_filter(hour))
            else:
                filters.append(_make_time_after_filter(hour))

    return filters


def _make_weekday_filter(weekday: int, exclude: bool = True) -> Any:
    def _filter(slot: FreeSlot) -> bool:
        from datetime import date as dt_date
        try:
            d = dt_date.fromisoformat(slot.date)
            is_target = d.weekday() == weekday
            return not is_target if exclude else is_target
        except (ValueError, TypeError):
            return True
    return _filter


def _make_combined_weekday_period_filter(weekday: int, period_label: str, exclude: bool = True) -> Any:
    """组合星期+时段过滤：仅当同时匹配星期和时段时才排除/保留。"""
    def _filter(slot: FreeSlot) -> bool:
        from datetime import date as dt_date
        try:
            d = dt_date.fromisoformat(slot.date)
            hour = _slot_hour(slot)
            p = _period_label(hour)
            is_target = d.weekday() == weekday and p == period_label
            return not is_target if exclude else is_target
        except (ValueError, TypeError):
            return True
    return _filter


def _make_period_filter(period_label: str, exclude: bool = True) -> Any:
    def _filter(slot: FreeSlot) -> bool:
        hour = _slot_hour(slot)
        p = _period_label(hour)
        is_target = p == period_label
        return not is_target if exclude else is_target
    return _filter


# 中文数字映射
_CHINESE_DIGITS: dict[str, int] = {
    "零": 0, "一": 1, "二": 2, "三": 3, "四": 4,
    "五": 5, "六": 6, "七": 7, "八": 8, "九": 9,
    "十": 10, "十一": 11, "十二": 12,
    "十三": 13, "十四": 14, "十五": 15, "十六": 16,
    "十七": 17, "十八": 18, "十九": 19, "二十": 20,
    "二十一": 21, "二十二": 22, "二十三": 23,
}


def _parse_chinese_number(text: str) -> int | None:
    """解析中文数字，支持 '三' 或 '三点' 等格式。"""
    # 先尝试直接匹配中文数字
    for cn, num in sorted(_CHINESE_DIGITS.items(), key=lambda x: -len(x[0])):
        if cn in text:
            return num
    return None


def _make_time_before_filter(hour: int) -> Any:
    """在 X 点前的时段不受限，X 点及之后的时段被排除。"""
    def _filter(slot: FreeSlot) -> bool:
        slot_hour = slot.start // 60
        return slot_hour < hour
    return _filter


def _make_time_after_filter(hour: int) -> Any:
    """在 X 点之后的时段不受限，X 点及之前的时段被排除。"""
    def _filter(slot: FreeSlot) -> bool:
        slot_hour = slot.start // 60
        return slot_hour >= hour
    return _filter



# ── 评分权重 ──
W_MEMORY = 0.35      # 时段偏好匹配（通用时段，对所有任务统一生效）
W_UNDERSTANDING = 0.25  # 理解匹配度（LLM preferred_time/focus_level）
W_TIME = 0.15        # 时间可用性
W_PRIORITY = 0.15    # 任务优先级
W_DEADLINE = 0.10    # 截止日期（1 - 紧迫度）
W_CONFLICT = 0.10    # 冲突风险（1 - 风险）
W_WORKLOAD = 0.10    # 负荷惩罚（1 - 惩罚）

PRIORITY_SCORE: dict[str, int] = {"high": 3, "medium": 2, "low": 1}


# ── 时段划分 ──
MORNING_START = 6          # 06:00
MORNING_END = 12           # 12:00
AFTERNOON_END = 18         # 18:00
EVENING_END = 23           # 23:00


def _slot_hour(slot: FreeSlot) -> float:
    """空闲时段的中点小时数。"""
    return (slot.start + slot.end) / 2.0 / 60.0


def _period_label(hour: float) -> str:
    """返回小时数对应的时段标签。"""
    if hour < MORNING_START:
        return "凌晨"
    if hour < MORNING_END:
        return "上午"
    if hour < AFTERNOON_END:
        return "下午"
    return "晚上"


# ── 各维度评分函数 ──

def score_memory_match(
    slot: FreeSlot,
    task: PlanV2Task,
    memories: list[str],
) -> float:
    """基础时段分 (0.0-1.0)

    所有记忆偏好（时段、活动类型）由 LLM understanding 层
    通过 score_understanding 精确控制，此处仅返回基础分。
    """
    hour = _slot_hour(slot)

    score = 0.3  # 基础分

    # 午间时段降分
    if 12 <= hour <= 14:
        score -= 0.10

    return min(1.0, max(0.0, score))


def score_understanding(
    slot: FreeSlot,
    task: PlanV2Task,
    understanding: dict[str, str] | None,
) -> float:
    """Task understanding 匹配度 (0.0-1.0)

    根据 LLM 理解层的 preferred_time 和 focus_level 对时段评分。
    understanding 为 None 时返回 0.0（不改变原有评分）。
    """
    if not understanding:
        return 0.0

    hour = _slot_hour(slot)
    period = _period_label(hour)
    score = 0.0

    # preferred_time 匹配
    pref = understanding.get("preferred_time", "any")
    if pref == "any":
        score += 0.3
    elif pref == period:
        score += 0.5

    # focus_level 匹配
    focus = understanding.get("focus_level", "flexible")
    if focus == "deep" and 8 <= hour <= 12:
        score += 0.3
    elif focus == "light" and (14 <= hour <= 17 or 18 <= hour <= 22):
        score += 0.2
    else:
        score += 0.1  # flexible → any time is fine

    return min(1.0, score)


def score_time_availability(slot: FreeSlot) -> float:
    """时间可用性 (0.0-1.0)

    根据一天中的时段评估可用性：
    - 上午 8:00-12:00 → 最佳 (0.9)
    - 午间 12:00-14:00 → 一般 (0.5)
    - 下午 14:00-17:00 → 良好 (0.7)
    - 傍晚 17:00-20:00 → 一般 (0.5)
    - 晚上 20:00-23:00 → 边缘 (0.3)
    - 凌晨 23:00-6:00 → 低分 (0.1)
    """
    hour = _slot_hour(slot)

    # 最佳时段：8:00-12:00
    if 8 <= hour < 12:
        return 0.9
    # 午间时段：12:00-14:00
    if 12 <= hour < 14:
        return 0.5
    # 良好时段：14:00-17:00
    if 14 <= hour < 17:
        return 0.7
    # 一般时段：6:00-8:00 或 17:00-20:00
    if 6 <= hour < 8 or 17 <= hour < 20:
        return 0.5
    # 边缘时段：20:00-23:00
    if 20 <= hour <= 23:
        return 0.3
    # 凌晨时段：< 6:00
    return 0.1


def score_priority(task: PlanV2Task, priority: str) -> float:
    """任务优先级得分 (0.0-1.0)

    高优先级任务得分更高，表示需要优先安排到好时段。
    """
    return {
        "high": 0.9,
        "medium": 0.5,
        "low": 0.2,
    }.get(priority, 0.5)


def score_deadline_urgency(task: PlanV2Task) -> float:
    """截止日期紧迫度 (0.0-1.0)，返回 1 - 紧迫度

    紧迫度越高，得分越低（表示需要优先安排）。
    """
    if not task.deadline:
        return 0.5  # 无截止日，中等分

    deadline = parse_local_date(task.deadline)
    if not deadline:
        return 0.5

    days_until = (deadline - date.today()).days

    if days_until <= 0:
        return 0.0    # 已过期
    if days_until <= 1:
        return 0.1    # 明天截止
    if days_until <= 3:
        return 0.3    # 3天内
    if days_until <= 7:
        return 0.5    # 1周内
    if days_until <= 14:
        return 0.7    # 2周内
    return 0.9        # 时间充裕


def score_conflict_risk(
    slot: FreeSlot,
    existing_schedule: list[ExistingBlock],
) -> float:
    """冲突风险 (0.0-1.0)，返回 1 - 风险

    检查 slot 是否紧邻已有日程。
    紧邻的日程越多，风险越高，得分越低。
    """
    nearby = 0
    threshold = 30  # 30 分钟内算"紧邻"
    for block in existing_schedule:
        if block.date != slot.date or block.status == "pending":
            continue
        gap = min(
            abs(slot.start - block.end),
            abs(slot.end - block.start),
        )
        if gap < threshold:
            nearby += 1

    # 无紧邻日程 → 低风险 → 高分
    if nearby == 0:
        return 1.0
    # 1 个紧邻 → 中等风险
    if nearby == 1:
        return 0.7
    # 2 个紧邻 → 较高风险
    if nearby == 2:
        return 0.4
    # 3+ 个紧邻 → 高风险
    return 0.1


def score_workload_penalty(
    slot: FreeSlot,
    existing_schedule: list[ExistingBlock],
    already_assigned: list[PlanV2Block],
) -> float:
    """负荷惩罚 (0.0-1.0)，返回 1 - 惩罚

    当天已有工作量越多，惩罚越高，得分越低。
    """
    # 计算当天已有工作量
    total_minutes = 0
    for block in existing_schedule:
        if block.date == slot.date and block.status != "pending":
            total_minutes += block.end - block.start
    for block in already_assigned:
        if block.date == slot.date:
            total_minutes += block.end - block.start

    max_workload = 480  # 8 小时
    if total_minutes >= max_workload:
        return 0.0  # 已满负荷
    if total_minutes >= max_workload * 0.75:
        return 0.3  # 几乎满负荷
    if total_minutes >= max_workload * 0.5:
        return 0.6  # 过半负荷
    return 1.0  # 负荷较轻


# ── SlotScorer 类 ──

class SlotScorer:
    """Slot 评分器 — 对每个候选空闲时段计算综合评分。

    评分公式：
        Slot Score =
            Memory匹配度 × 0.35
            + 时间可用性   × 0.20
            + 任务优先级   × 0.15
            + 截止日期     × 0.10
            - 冲突风险     × 0.10
            - 负荷惩罚     × 0.10

    最终得分范围 0.0-1.0，Python 选最高分。
    """

    def __init__(
        self,
        existing_schedule: list[ExistingBlock] | None = None,
        already_assigned: list[PlanV2Block] | None = None,
    ):
        self.existing_schedule = existing_schedule or []
        self.already_assigned = already_assigned or []

    def score(
        self,
        slot: FreeSlot,
        task: PlanV2Task,
        priority: str,
        memories: list[str],
        understanding: dict[str, str] | None = None,
    ) -> float:
        """计算一个空闲时段的综合评分。"""
        m = score_memory_match(slot, task, memories)
        u = score_understanding(slot, task, understanding)
        t = score_time_availability(slot)
        p = score_priority(task, priority)
        d = score_deadline_urgency(task)
        c = score_conflict_risk(slot, self.existing_schedule)
        w = score_workload_penalty(slot, self.existing_schedule, self.already_assigned)

        return (
            m * W_MEMORY
            + u * W_UNDERSTANDING
            + t * W_TIME
            + p * W_PRIORITY
            + d * W_DEADLINE
            + c * W_CONFLICT
            + w * W_WORKLOAD
        )

    def score_all(
        self,
        slots: list[FreeSlot],
        task: PlanV2Task,
        priority: str,
        memories: list[str],
        understanding: dict[str, str] | None = None,
    ) -> list[tuple[FreeSlot, float]]:
        """对多个空闲时段评分，按分数降序排列。"""
        scored = [
            (slot, self.score(slot, task, priority, memories, understanding))
            for slot in slots
        ]
        scored.sort(key=lambda x: -x[1])
        return scored


# ── 工具函数 ──

def resolve_priority(task: PlanV2Task) -> str:
    """解析任务优先级。用户手动指定则直接使用，auto 则根据 deadline 推断。"""
    if task.priority != "auto":
        return task.priority
    if task.deadline:
        deadline = parse_local_date(task.deadline)
        if deadline:
            days_until = (deadline - date.today()).days
            if days_until <= 3:
                return "high"
            elif days_until <= 7:
                return "medium"
    return "medium"


# ── 主入口 ──

def schedule_tasks(
    tasks: list[PlanV2Task],
    existing_schedule: list[ExistingBlock],
    planning_range: tuple[date, date],
    memories: list[str] | None = None,
    understandings: dict[str, dict[str, str]] | None = None,
    constraint_filters: list[Any] | None = None,
    day_start: int = DEFAULT_DAY_START,
    day_end: int = DEFAULT_DAY_END,
    max_daily_workload: int = 480,
) -> tuple[list[PlanV2Block], list[str], list[Any]]:
    """调度引擎主入口 — 将任务分配到最佳空闲时段。

    流程：
      1. 解析优先级，高→低排序
      2. 生成所有空闲时段（应用 hard constraints 排除非法时段）
      3. 对每个任务，用 SlotScorer 给所有候选时段评分（含 understanding）
      4. 选最高分时段，15 分钟步长微调
      5. 校验最终规划

    Args:
        tasks: 待排任务列表
        existing_schedule: 已有日程
        planning_range: (start_date, end_date)
        memories: 用户记忆偏好列表
        understandings: LLM 任务理解 dict（key=任务 title）
        constraint_filters: hard constraint 过滤函数列表（True=允许该时段）
        day_start: 每日可排起始分钟（默认 06:00）
        day_end: 每日可排结束分钟（默认 23:00）
        max_daily_workload: 每日最大工作量（分钟，默认 480=8h）

    Returns:
        (blocks, unassigned, validation_issues)
    """
    range_start, range_end = planning_range
    memories = memories or []
    understandings = understandings or {}
    constraint_filters = constraint_filters or []

    # 1. 解析优先级，按高→低排序
    resolved_tasks: list[tuple[PlanV2Task, str]] = []
    for task in tasks:
        priority = resolve_priority(task)
        resolved_tasks.append((task, priority))
    resolved_tasks.sort(key=lambda x: -PRIORITY_SCORE.get(x[1], 2))

    # 2. 生成所有空闲时段
    all_free_slots = find_free_slots(
        existing_schedule,
        range_start,
        range_end,
        day_start=day_start,
        day_end=day_end,
    )
    # 应用 hard constraints 排除非法时段
    if constraint_filters:
        all_free_slots = [
            slot for slot in all_free_slots
            if all(fn(slot) for fn in constraint_filters)
        ]

    # 3. 逐任务分配
    blocks: list[PlanV2Block] = []
    unassigned: list[str] = []
    occupied = [b.model_copy() for b in existing_schedule]

    scorer = SlotScorer(existing_schedule, blocks)

    for task, priority in resolved_tasks:
        available = filter_slots_by_duration(all_free_slots, task.duration)

        if available:
            # 用 SlotScorer 评分并排序
            task_understanding = understandings.get(task.title)
            scored = scorer.score_all(available, task, priority, memories, task_understanding)

            placed = False
            best_candidate: PlanV2Block | None = None
            best_score = -1.0
            for slot, _slot_score in scored:
                slot_duration = slot.end - slot.start
                if slot_duration < task.duration:
                    continue
                for minute_start in range(slot.start, slot.end - task.duration + 1, 15):
                    # 创建候选时间块的临时 slot 用于评分
                    candidate_slot = FreeSlot(slot.date, minute_start, minute_start + task.duration)
                    position_score = scorer.score(candidate_slot, task, priority, memories, task_understanding)
                    if position_score <= best_score:
                        continue
                    candidate = PlanV2Block(
                        title=task.title[:80],
                        date=slot.date,
                        start=minute_start,
                        end=minute_start + task.duration,
                        category=guess_category(task.title),  # type: ignore[arg-type]
                        priority=priority,  # type: ignore[arg-type]
                        task_id=task.task_id,
                        subtask_id=task.subtask_id,
                    )
                    candidate_existing = ExistingBlock(
                        date=candidate.date,
                        start=candidate.start,
                        end=candidate.end,
                    )
                    if overlaps_with_any(candidate_existing, occupied):
                        continue
                    best_candidate = candidate
                    best_score = position_score
                    placed = True

            if placed and best_candidate is not None:
                candidate_existing = ExistingBlock(
                    date=best_candidate.date,
                    start=best_candidate.start,
                    end=best_candidate.end,
                )
                occupied.append(candidate_existing)
                blocks.append(best_candidate)
            else:
                unassigned.append(task.title)
        else:
            unassigned.append(task.title)

    # 4. 校验
    result = validate_plan_v2(blocks, tasks, existing_schedule, max_daily_workload)

    return blocks, unassigned, result.issues
