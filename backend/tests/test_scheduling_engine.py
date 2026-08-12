"""测试 scheduling_engine 模块 — 调度引擎评分系统。"""

from __future__ import annotations

from datetime import date, timedelta

from app.schemas import ExistingBlock, PlanV2Task
from app.services.scheduling_engine import (
    SlotScorer,
    resolve_priority,
    schedule_tasks,
    score_memory_match,
    score_time_availability,
    score_priority,
    score_deadline_urgency,
    score_conflict_risk,
    score_workload_penalty,
)
from app.services.slot_finder import FreeSlot


# ============================================================
# 1. 优先级解析
# ============================================================

def test_resolve_priority_user_specified() -> None:
    """用户手动指定的优先级直接使用。"""
    task = PlanV2Task(title="写报告", duration=60, priority="high")
    assert resolve_priority(task) == "high"

    task = PlanV2Task(title="低优先级", duration=60, priority="low")
    assert resolve_priority(task) == "low"


def test_resolve_priority_auto_no_deadline() -> None:
    """auto 且无截止日时返回 medium。"""
    task = PlanV2Task(title="学习", duration=60, priority="auto")
    assert resolve_priority(task) == "medium"


def test_resolve_priority_auto_urgent_deadline() -> None:
    """auto 且截止日在 3 天内返回 high。"""
    deadline = (date.today() + timedelta(days=1)).isoformat()
    task = PlanV2Task(title="紧急任务", duration=60, priority="auto", deadline=deadline)
    assert resolve_priority(task) == "high"


# ============================================================
# 2. 各维度评分
# ============================================================

def test_score_memory_match_default() -> None:
    """无记忆偏好时返回基础分 0.3。"""
    slot = FreeSlot("2026-08-03", 9 * 60, 10 * 60)
    task = PlanV2Task(title="写代码", duration=60)
    score = score_memory_match(slot, task, [])
    assert score == 0.3


def test_score_memory_match_morning_preference() -> None:
    """上午偏好记忆应提升上午时段分数。"""
    slot = FreeSlot("2026-08-03", 8 * 60, 9 * 60)
    task = PlanV2Task(title="写代码", duration=60)
    score = score_memory_match(slot, task, ["我习惯上午写代码"])
    assert score == 0.3 + 0.35  # 基础分 + 时段匹配


def test_score_memory_match_afternoon_preference() -> None:
    """下午偏好记忆应提升下午时段分数。"""
    slot = FreeSlot("2026-08-03", 15 * 60, 16 * 60)
    task = PlanV2Task(title="写代码", duration=60)
    score = score_memory_match(slot, task, ["下午工作效率高"])
    assert score == 0.3 + 0.35


def test_score_memory_match_deep_work() -> None:
    """深度工作偏好 + 上午时段 → 加分。"""
    slot = FreeSlot("2026-08-03", 9 * 60, 10 * 60)
    task = PlanV2Task(title="写代码", duration=60)
    score = score_memory_match(slot, task, ["上午更适合深度工作"])
    # 时段匹配 (+0.35) + 深度工作 (+0.20)
    assert score == 0.3 + 0.35 + 0.20


def test_score_memory_match_exercise() -> None:
    """运动任务 + 合适时段 → 加分。"""
    slot = FreeSlot("2026-08-03", 7 * 60, 8 * 60)
    task = PlanV2Task(title="跑步", duration=60)
    score = score_memory_match(slot, task, [])
    # 任务类别匹配 (+0.15)
    assert score == 0.3 + 0.15


def test_score_memory_match_lunch_penalty() -> None:
    """午间时段降分。"""
    slot = FreeSlot("2026-08-03", 12 * 60, 13 * 60)
    task = PlanV2Task(title="休息", duration=60)
    score = score_memory_match(slot, task, [])
    # 基础分 0.3 - 午间降分 0.10
    assert score == 0.3 - 0.10


def test_score_time_availability_morning() -> None:
    """上午 8-12 点得分最高。"""
    slot = FreeSlot("2026-08-03", 9 * 60, 10 * 60)
    assert score_time_availability(slot) == 0.9


def test_score_time_availability_afternoon() -> None:
    """下午 14-17 点得分良好。"""
    slot = FreeSlot("2026-08-03", 15 * 60, 16 * 60)
    assert score_time_availability(slot) == 0.7


def test_score_time_availability_evening() -> None:
    """晚上 20-23 点得分较低。"""
    slot = FreeSlot("2026-08-03", 20 * 60, 21 * 60)
    assert score_time_availability(slot) == 0.3


def test_score_priority_high() -> None:
    """高优先级任务得高分。"""
    task = PlanV2Task(title="重要任务", duration=60, priority="high")
    assert score_priority(task, "high") == 0.9


def test_score_priority_low() -> None:
    """低优先级任务得低分。"""
    task = PlanV2Task(title="无所谓", duration=60, priority="low")
    assert score_priority(task, "low") == 0.2


def test_score_deadline_no_deadline() -> None:
    """无截止日时返回中等分。"""
    task = PlanV2Task(title="任务", duration=60)
    assert score_deadline_urgency(task) == 0.5


def test_score_deadline_urgent() -> None:
    """明天截止得分极低。"""
    deadline = (date.today() + timedelta(days=1)).isoformat()
    task = PlanV2Task(title="紧急任务", duration=60, deadline=deadline)
    assert score_deadline_urgency(task) <= 0.2


def test_score_deadline_comfortable() -> None:
    """时间充裕时得分高。"""
    deadline = (date.today() + timedelta(days=30)).isoformat()
    task = PlanV2Task(title="远期任务", duration=60, deadline=deadline)
    assert score_deadline_urgency(task) == 0.9


def test_score_conflict_risk_no_nearby() -> None:
    """无紧邻日程时冲突风险低（得分高）。"""
    slot = FreeSlot("2026-08-03", 9 * 60, 10 * 60)
    existing = [
        ExistingBlock(date="2026-08-03", start=14 * 60, end=15 * 60, status="scheduled"),
    ]
    assert score_conflict_risk(slot, existing) == 1.0


def test_score_conflict_risk_nearby() -> None:
    """有紧邻日程时冲突风险中等。"""
    slot = FreeSlot("2026-08-03", 10 * 60, 11 * 60)
    existing = [
        ExistingBlock(date="2026-08-03", start=9 * 60, end=10 * 60, status="scheduled"),
    ]
    # 紧邻（gap=0），风险中等
    assert score_conflict_risk(slot, existing) == 0.7


def test_score_workload_penalty_light() -> None:
    """负荷较轻时得分高。"""
    slot = FreeSlot("2026-08-03", 15 * 60, 16 * 60)
    existing = [
        ExistingBlock(date="2026-08-03", start=9 * 60, end=10 * 60, status="scheduled"),
    ]
    assert score_workload_penalty(slot, existing, []) == 1.0


def test_score_workload_penalty_full() -> None:
    """满负荷时得分极低。"""
    slot = FreeSlot("2026-08-03", 20 * 60, 21 * 60)
    existing = [
        ExistingBlock(date="2026-08-03", start=8 * 60, end=12 * 60, status="scheduled"),
        ExistingBlock(date="2026-08-03", start=13 * 60, end=18 * 60, status="scheduled"),
    ]
    assert score_workload_penalty(slot, existing, []) == 0.0


# ============================================================
# 3. SlotScorer 综合评分
# ============================================================

def test_slot_scorer_basic() -> None:
    """SlotScorer 基本评分功能。"""
    slot = FreeSlot("2026-08-03", 9 * 60, 11 * 60)
    task = PlanV2Task(title="Agent后端开发", duration=120)
    scorer = SlotScorer()
    score = scorer.score(slot, task, "high", ["上午更适合深度工作"])
    assert 0.0 <= score <= 1.0
    # 上午 + 深度工作 + 高优先级 → 应该较高分
    assert score > 0.5


def test_slot_scorer_morning_better_than_evening() -> None:
    """有上午偏好时，上午时段得分应高于晚上。"""
    morning = FreeSlot("2026-08-03", 9 * 60, 11 * 60)
    evening = FreeSlot("2026-08-03", 20 * 60, 22 * 60)
    task = PlanV2Task(title="Agent后端开发", duration=120)
    scorer = SlotScorer()
    s_morning = scorer.score(morning, task, "high", ["上午更适合深度工作"])
    s_evening = scorer.score(evening, task, "high", ["上午更适合深度工作"])
    assert s_morning > s_evening


def test_slot_scorer_afternoon_vs_evening() -> None:
    """有下午偏好时，下午时段得分应高于晚上。"""
    afternoon = FreeSlot("2026-08-03", 14 * 60, 16 * 60)
    evening = FreeSlot("2026-08-03", 20 * 60, 22 * 60)
    task = PlanV2Task(title="写报告", duration=120)
    scorer = SlotScorer()
    s_afternoon = scorer.score(afternoon, task, "medium", ["下午适合写报告"])
    s_evening = scorer.score(evening, task, "medium", ["下午适合写报告"])
    assert s_afternoon > s_evening


def test_slot_scorer_score_all_order() -> None:
    """score_all 应按分数降序排列。"""
    slots = [
        FreeSlot("2026-08-03", 9 * 60, 11 * 60),
        FreeSlot("2026-08-03", 14 * 60, 16 * 60),
        FreeSlot("2026-08-03", 20 * 60, 22 * 60),
    ]
    task = PlanV2Task(title="Agent后端开发", duration=120, priority="high")
    scorer = SlotScorer()
    scored = scorer.score_all(slots, task, "high", ["上午更适合深度工作"])
    # 分数应降序排列
    for i in range(len(scored) - 1):
        assert scored[i][1] >= scored[i + 1][1]
    # 第一个（最高分）应是上午时段
    assert scored[0][0].start == 9 * 60


# ============================================================
# 4. 集成调度测试
# ============================================================

def test_schedule_tasks_simple() -> None:
    """一个任务一个空闲时段。"""
    tasks = [PlanV2Task(title="写代码", duration=60)]
    blocks, unassigned, _issues = schedule_tasks(
        tasks, [], (date(2026, 8, 3), date(2026, 8, 3))
    )
    assert len(blocks) == 1
    assert blocks[0].title == "写代码"
    assert len(unassigned) == 0


def test_schedule_tasks_multi_day() -> None:
    """多天范围应能安排多个任务。"""
    tasks = [
        PlanV2Task(title="工作", duration=120),
        PlanV2Task(title="学习", duration=60),
        PlanV2Task(title="健身", duration=60),
    ]
    blocks, unassigned, _issues = schedule_tasks(
        tasks, [], (date(2026, 8, 3), date(2026, 8, 5))
    )
    assert len(blocks) == 3
    assert len(unassigned) == 0


def test_schedule_tasks_full_day() -> None:
    """全天被占满时应返回未安排。"""
    tasks = [PlanV2Task(title="写代码", duration=60)]
    existing = [
        ExistingBlock(date="2026-08-03", start=6 * 60, end=23 * 60, status="scheduled"),
    ]
    blocks, unassigned, _issues = schedule_tasks(
        tasks, existing, (date(2026, 8, 3), date(2026, 8, 3))
    )
    assert len(blocks) == 0
    assert "写代码" in unassigned


def test_schedule_tasks_avoids_existing() -> None:
    """任务应避开已有日程。"""
    tasks = [PlanV2Task(title="开会", duration=60)]
    existing = [
        ExistingBlock(date="2026-08-03", start=9 * 60, end=10 * 60, status="scheduled"),
    ]
    blocks, unassigned, _issues = schedule_tasks(
        tasks, existing, (date(2026, 8, 3), date(2026, 8, 3))
    )
    assert len(blocks) == 1
    block = blocks[0]
    assert not (block.date == "2026-08-03" and block.start < 10 * 60 and 9 * 60 < block.end)
    assert len(unassigned) == 0


def test_schedule_tasks_memory_influences_placement() -> None:
    """记忆偏好应影响任务放置位置（有上午偏好时放在上午）。"""
    tasks = [PlanV2Task(title="Agent后端开发", duration=120)]
    existing = [
        ExistingBlock(date="2026-08-03", start=14 * 60, end=15 * 60, status="scheduled"),
    ]
    blocks, unassigned, _issues = schedule_tasks(
        tasks, existing, (date(2026, 8, 3), date(2026, 8, 3)),
        memories=["上午更适合深度工作"],
    )
    assert len(blocks) == 1
    # 如果有上午偏好，应放在上午时段
    assert blocks[0].start < 12 * 60


def test_schedule_tasks_memory_afternoon() -> None:
    """下午偏好记忆应把任务放在下午。"""
    tasks = [PlanV2Task(title="写报告", duration=60)]
    existing = [
        ExistingBlock(date="2026-08-03", start=9 * 60, end=10 * 60, status="scheduled"),
    ]
    blocks, unassigned, _issues = schedule_tasks(
        tasks, existing, (date(2026, 8, 3), date(2026, 8, 3)),
        memories=["下午更适合写报告"],
    )
    assert len(blocks) == 1
    # 下午偏好 → 应放在下午
    assert blocks[0].start >= 12 * 60


def test_schedule_tasks_respects_priority_order() -> None:
    """高优先级任务应先安排。"""
    tasks = [
        PlanV2Task(title="低优先级任务", duration=120, priority="low"),
        PlanV2Task(title="高优先级任务", duration=60, priority="high"),
    ]
    blocks, unassigned, _issues = schedule_tasks(
        tasks, [], (date(2026, 8, 3), date(2026, 8, 3))
    )
    assert len(blocks) == 2
    assert blocks[0].priority == "high"
    assert blocks[1].priority == "low"
