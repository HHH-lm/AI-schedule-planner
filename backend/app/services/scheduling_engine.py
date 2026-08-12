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
          SlotScorer 六维评分：
            Memory匹配度  × 0.35
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


# ── 评分权重 ──
W_MEMORY = 0.35      # Memory匹配度
W_TIME = 0.20        # 时间可用性
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
    """Memory匹配度 (0.0-1.0)

    解析记忆文本中的时段偏好，与 slot 的时段做匹配。
    同时也匹配任务类别与典型时段的关系。
    """
    hour = _slot_hour(slot)
    period = _period_label(hour)

    score = 0.3  # 基础分
    matched = False

    # 解析每条记忆，提取时段偏好关键词
    for mem in memories:
        mem_lower = mem.lower()

        # 偏好时段检测
        prefers_morning = any(kw in mem_lower for kw in ("上午", "早晨", "早上", "早起"))
        prefers_afternoon = any(kw in mem_lower for kw in ("下午", "午后"))
        prefers_evening = any(kw in mem_lower for kw in ("晚上", "傍晚", "夜间"))

        # 深度工作偏好
        deep_work = any(kw in mem_lower for kw in (
            "深度工作", "专注", "集中", "高效", "精力"
        ))

        # 运动时间偏好
        exercise_pref = any(kw in mem_lower for kw in (
            "运动", "健身", "跑步", "锻炼"
        ))

        # 时段匹配
        if prefers_morning and period == "上午":
            score += 0.35
            matched = True
        elif prefers_afternoon and period == "下午":
            score += 0.35
            matched = True
        elif prefers_evening and period == "晚上":
            score += 0.35
            matched = True

        # 深度工作 → 上午加分
        if deep_work and period == "上午":
            score += 0.20
            matched = True

        # 运动偏好 → 早晨/傍晚加分
        if exercise_pref and (hour < 9 or 17 <= hour <= 19):
            score += 0.20
            matched = True

    # 任务类别匹配典型时段
    title_lower = task.title.lower()
    if any(kw in title_lower for kw in ("健身", "跑步", "运动", "锻炼", "瑜伽")):
        if hour < 9 or 17 <= hour <= 19:
            score += 0.15
            matched = True
    elif any(kw in title_lower for kw in ("学习", "阅读", "研究", "写作", "写文章", "深度")):
        if 8 <= hour <= 12:
            score += 0.15
            matched = True
    elif any(kw in title_lower for kw in ("开会", "会议", "客户", "需求", "讨论")):
        if 9 <= hour <= 11 or 14 <= hour <= 17:
            score += 0.15
            matched = True

    # 午间时段降分
    if 12 <= hour <= 14:
        score -= 0.10

    return min(1.0, max(0.0, score))


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
    ) -> float:
        """计算一个空闲时段的综合评分。"""
        m = score_memory_match(slot, task, memories)
        t = score_time_availability(slot)
        p = score_priority(task, priority)
        d = score_deadline_urgency(task)
        c = score_conflict_risk(slot, self.existing_schedule)
        w = score_workload_penalty(slot, self.existing_schedule, self.already_assigned)

        return (
            m * W_MEMORY
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
    ) -> list[tuple[FreeSlot, float]]:
        """对多个空闲时段评分，按分数降序排列。"""
        scored = [(slot, self.score(slot, task, priority, memories)) for slot in slots]
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
    day_start: int = DEFAULT_DAY_START,
    day_end: int = DEFAULT_DAY_END,
    max_daily_workload: int = 480,
) -> tuple[list[PlanV2Block], list[str], list[Any]]:
    """调度引擎主入口 — 将任务分配到最佳空闲时段。

    流程：
      1. 解析优先级，高→低排序
      2. 生成所有空闲时段
      3. 对每个任务，用 SlotScorer 给所有候选时段评分
      4. 选最高分时段，15 分钟步长微调
      5. 校验最终规划

    Args:
        tasks: 待排任务列表
        existing_schedule: 已有日程
        planning_range: (start_date, end_date)
        memories: 用户记忆偏好列表
        day_start: 每日可排起始分钟（默认 06:00）
        day_end: 每日可排结束分钟（默认 23:00）
        max_daily_workload: 每日最大工作量（分钟，默认 480=8h）

    Returns:
        (blocks, unassigned, validation_issues)
    """
    range_start, range_end = planning_range
    memories = memories or []

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

    # 3. 逐任务分配
    blocks: list[PlanV2Block] = []
    unassigned: list[str] = []
    occupied = [b.model_copy() for b in existing_schedule]

    scorer = SlotScorer(existing_schedule, blocks)

    for task, priority in resolved_tasks:
        available = filter_slots_by_duration(all_free_slots, task.duration)

        if available:
            # 用 SlotScorer 评分并排序
            scored = scorer.score_all(available, task, priority, memories)

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
                    position_score = scorer.score(candidate_slot, task, priority, memories)
                    if position_score <= best_score:
                        continue
                    candidate = PlanV2Block(
                        title=task.title[:80],
                        date=slot.date,
                        start=minute_start,
                        end=minute_start + task.duration,
                        category=guess_category(task.title),  # type: ignore[arg-type]
                        priority=priority,  # type: ignore[arg-type]
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
