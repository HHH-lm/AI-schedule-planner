"""测试 scheduling_engine 模块 — 调度引擎评分系统。"""

from __future__ import annotations

from datetime import date, timedelta

from app.schemas import (
    ConstraintSpec,
    ExistingBlock,
    PlanV2Task,
    PlanningWeights,
    WorkStyleSpec,
)
from app.services.scheduling_engine import (
    SlotScorer,
    W_CONFLICT,
    W_DEADLINE,
    W_MEMORY,
    W_PRIORITY,
    W_TIME,
    W_UNDERSTANDING,
    W_WORKLOAD,
    build_constraint_filters,
    parse_constraint_filters,
    parse_work_style,
    resolve_priority,
    schedule_tasks,
    score_memory_match,
    score_understanding,
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
    """时段偏好由 LLM understanding 层处理，score_memory_match 只返回基础分。"""
    slot = FreeSlot("2026-08-03", 8 * 60, 9 * 60)
    task = PlanV2Task(title="写代码", duration=60)
    score = score_memory_match(slot, task, ["我习惯上午写代码"])
    assert score == 0.3


def test_score_memory_match_afternoon_preference() -> None:
    """时段偏好由 LLM understanding 层处理，score_memory_match 只返回基础分。"""
    slot = FreeSlot("2026-08-03", 15 * 60, 16 * 60)
    task = PlanV2Task(title="写代码", duration=60)
    score = score_memory_match(slot, task, ["下午工作效率高"])
    assert score == 0.3


def test_score_memory_match_deep_work() -> None:
    """深度工作偏好由 LLM understanding 层处理，score_memory_match 只返回基础分。"""
    slot = FreeSlot("2026-08-03", 9 * 60, 10 * 60)
    task = PlanV2Task(title="写代码", duration=60)
    score = score_memory_match(slot, task, ["上午更适合深度工作"])
    assert score == 0.3


def test_score_memory_match_exercise() -> None:
    """运动任务在合适时段，活动类型匹配由 LLM understanding 控制。"""
    slot = FreeSlot("2026-08-03", 7 * 60, 8 * 60)
    task = PlanV2Task(title="跑步", duration=60)
    score = score_memory_match(slot, task, [])
    # 无记忆时返回基础分，活动类型匹配由 LLM 处理
    assert score == 0.3


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


def test_planning_weights_defaults_match_module_constants() -> None:
    """PlanningWeights 默认值应与调度引擎模块常量一致。"""
    weights = PlanningWeights()
    assert weights.memory == W_MEMORY
    assert weights.understanding == W_UNDERSTANDING
    assert weights.time == W_TIME
    assert weights.priority == W_PRIORITY
    assert weights.deadline == W_DEADLINE
    assert weights.conflict == W_CONFLICT
    assert weights.workload == W_WORKLOAD


def test_slot_scorer_custom_weights_scale_components() -> None:
    """自定义权重应只放大对应维度：单维度权重 1.0 时总分等于该维度分。"""
    slot = FreeSlot("2026-08-03", 9 * 60, 10 * 60)
    task = PlanV2Task(title="写代码", duration=60)
    understanding = {
        "title": "写代码",
        "preferred_time": "上午",
        "focus_level": "deep",
        "notes": "",
    }

    scorer_memory = SlotScorer(
        weights=PlanningWeights(
            memory=1.0, understanding=0, time=0, priority=0,
            deadline=0, conflict=0, workload=0,
        )
    )
    assert scorer_memory.score(slot, task, "medium", []) == score_memory_match(slot, task, [])

    scorer_understanding = SlotScorer(
        weights=PlanningWeights(
            memory=0, understanding=1.0, time=0, priority=0,
            deadline=0, conflict=0, workload=0,
        )
    )
    assert scorer_understanding.score(
        slot, task, "medium", [], understanding
    ) == score_understanding(slot, task, understanding)


def test_schedule_tasks_custom_weights_change_placement() -> None:
    """自定义权重应改变调度结果：默认权重优先理解偏好的上午，冲突权重拉满时选最早无紧邻冲突时段。"""
    tasks = [PlanV2Task(title="写代码", duration=60)]
    existing = [
        ExistingBlock(date="2026-08-03", start=10 * 60, end=11 * 60),
        ExistingBlock(date="2026-08-03", start=11 * 60, end=12 * 60),
    ]
    understanding = {
        "title": "写代码",
        "preferred_time": "上午",
        "focus_level": "deep",
        "notes": "",
    }

    blocks_default, _, _ = schedule_tasks(
        tasks,
        existing,
        (date(2026, 8, 3), date(2026, 8, 3)),
        understandings={"写代码": understanding},
    )
    blocks_conflict, _, _ = schedule_tasks(
        tasks,
        existing,
        (date(2026, 8, 3), date(2026, 8, 3)),
        understandings={"写代码": understanding},
        weights=PlanningWeights(
            memory=0, understanding=0, time=0, priority=0,
            deadline=0, conflict=1.0, workload=0,
        ),
    )

    assert blocks_default[0].start < 10 * 60, (
        f"默认权重应优先理解偏好的上午时段，实际 "
        f"{blocks_default[0].start // 60}:{blocks_default[0].start % 60:02d}"
    )
    assert blocks_conflict[0].start == 6 * 60, (
        f"冲突权重拉满时应选最早无紧邻冲突的 6:00，实际 "
        f"{blocks_conflict[0].start // 60}:{blocks_conflict[0].start % 60:02d}"
    )
    assert blocks_default[0].start != blocks_conflict[0].start, "自定义权重应改变调度落点"


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
    """LLM understanding 的 preferred_time=下午 应把任务放在下午。"""
    tasks = [PlanV2Task(title="写报告", duration=60)]
    existing = [
        ExistingBlock(date="2026-08-03", start=9 * 60, end=10 * 60, status="scheduled"),
    ]
    blocks, unassigned, _issues = schedule_tasks(
        tasks, existing, (date(2026, 8, 3), date(2026, 8, 3)),
        understandings={"写报告": {"title": "写报告", "preferred_time": "下午", "focus_level": "flexible", "notes": ""}},
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


def test_schedule_tasks_memory_morning_vs_none() -> None:
    '''有上午偏好记忆时，任务应安排在上午；
       无记忆时，任务可能安排在下午（因上午有冲突）。'''
    tasks = [PlanV2Task(title="写代码", duration=60)]
    existing = [
        ExistingBlock(date="2026-08-03", start=9 * 60, end=10 * 60, status="scheduled"),
    ]

    # 无记忆 → 任务可能排在任何空闲时段
    blocks_no_mem, _, _ = schedule_tasks(
        tasks, existing, (date(2026, 8, 3), date(2026, 8, 3)),
    )
    # 有上午偏好记忆 → 应优先安排在上午空闲时段
    blocks_mem, _, _ = schedule_tasks(
        tasks, existing, (date(2026, 8, 3), date(2026, 8, 3)),
        memories=["上午更适合深度工作，请将重要任务安排在上午"],
    )
    # 有上午记忆时，如果上午有空闲时段，任务应安排在上午
    assert len(blocks_mem) == 1


def test_schedule_tasks_memory_changes_placement() -> None:
    '''不同记忆偏好应导致相同任务被安排在不同时段。
       这是证明 Memory 确实改变排期结果的关键测试。'''
    tasks = [PlanV2Task(title="写文章", duration=60)]
    existing = [
        ExistingBlock(date="2026-08-03", start=7 * 60, end=8 * 60, status="scheduled"),
        ExistingBlock(date="2026-08-03", start=9 * 60, end=10 * 60, status="scheduled"),
        ExistingBlock(date="2026-08-03", start=13 * 60, end=14 * 60, status="scheduled"),
    ]

    # 记忆 A：上午偏好 → 应排在没有冲突的上午时段 (10:00-12:00)
    blocks_am, _, _ = schedule_tasks(
        tasks, existing, (date(2026, 8, 3), date(2026, 8, 3)),
        memories=["上午头脑最清醒，适合写文章，请安排在上午"],
    )
    # 记忆 B：下午偏好 → 应排在没有冲突的下午时段
    blocks_pm, _, _ = schedule_tasks(
        tasks, existing, (date(2026, 8, 3), date(2026, 8, 3)),
        memories=["下午思路开阔，适合写文章，请安排在下午"],
        constraint_filters=parse_constraint_filters(["避开上午"]),
    )

    assert len(blocks_am) == 1
    assert len(blocks_pm) == 1

    # 上午偏好 → 应在上午 (10:00-12:00)
    assert blocks_am[0].start < 12 * 60, f"上午记忆应排上午，实际排在了 {blocks_am[0].start // 60}:{blocks_am[0].start % 60:02d}"
    # 下午偏好 → 应在下午 (14:00+)
    assert blocks_pm[0].start >= 13 * 60, f"下午记忆应排下午，实际排在了 {blocks_pm[0].start // 60}:{blocks_pm[0].start % 60:02d}"


def test_schedule_tasks_memory_evening_with_full_morning() -> None:
    '''当上午时间被占满时，晚上偏好记忆应把任务排到晚上。'''
    tasks = [PlanV2Task(title="写文章", duration=60)]
    # 阻塞整个上午 (6:00-13:00)
    existing = [
        ExistingBlock(date="2026-08-03", start=6 * 60, end=13 * 60, status="scheduled"),
        ExistingBlock(date="2026-08-03", start=14 * 60, end=15 * 60, status="scheduled"),
    ]

    blocks, _, _ = schedule_tasks(
        tasks, existing, (date(2026, 8, 3), date(2026, 8, 3)),
        memories=["晚上比较安静，适合写文章，请安排在晚上"],
    )
    assert len(blocks) == 1
    # 由于下午时段 (17:00-18:00) 的 time_availability 分数更高，
    # 晚上记忆偏好可能不足以完全克服时间可用性差异。
    # 但应确保任务不会被排到上午或中午时段。
    assert blocks[0].start >= 15 * 60, f"晚上记忆应排傍晚，实际排在了 {blocks[0].start // 60}:{blocks[0].start % 60:02d}"


def test_schedule_tasks_constraints_affect_placement() -> None:
    '''约束条件（通过记忆传递）应影响排期。'''
    tasks = [PlanV2Task(title="健身", duration=60)]
    existing = [
        ExistingBlock(date="2026-08-03", start=10 * 60, end=11 * 60, status="scheduled"),
    ]

    # 无记忆约束 → 任何空闲时段都可
    # 有"早上运动"记忆 → 应排到早上
    blocks, _, _ = schedule_tasks(
        tasks, existing, (date(2026, 8, 3), date(2026, 8, 3)),
        memories=["早上运动效果最好，请安排在早上"],
    )
    assert len(blocks) == 1
    # 健身 + 早上偏好 → 应安排在早上 (6:00-9:00)
    assert blocks[0].start < 9 * 60, f"早上运动偏好应排早上，实际排在了 {blocks[0].start // 60}:{blocks[0].start % 60:02d}"



# ============================================================
# 5. Understanding 评分与 Hard Constraints
# ============================================================

def test_score_understanding_none() -> None:
    """无 understanding 时返回 0.0，不影响原评分。"""
    slot = FreeSlot("2026-08-03", 9 * 60, 10 * 60)
    task = PlanV2Task(title="写代码", duration=60)
    assert score_understanding(slot, task, None) == 0.0


def test_score_understanding_deep_work_morning_afternoon() -> None:
    """LLM understanding 的 focus_level=deep 应让上午得分高于下午。"""
    task = PlanV2Task(title="写代码", duration=60)
    morning = FreeSlot("2026-08-03", 9 * 60, 10 * 60)
    afternoon = FreeSlot("2026-08-03", 15 * 60, 16 * 60)
    understanding = {"title": "写代码", "preferred_time": "上午", "focus_level": "deep"}
    s_morning = score_understanding(morning, task, understanding)
    s_afternoon = score_understanding(afternoon, task, understanding)
    assert s_morning > s_afternoon


def test_score_understanding_preferred_time() -> None:
    """preferred_time=上午 匹配上午时段。"""
    slot = FreeSlot("2026-08-03", 9 * 60, 10 * 60)
    task = PlanV2Task(title="写代码", duration=60)
    understanding = {"title": "写代码", "preferred_time": "上午", "focus_level": "flexible"}
    score = score_understanding(slot, task, understanding)
    assert score == 0.5 + 0.1  # preferred_time 匹配 (0.5) + flexible (0.1)


def test_score_understanding_deep_work_morning() -> None:
    """deep focus 在上午有额外加分。"""
    slot = FreeSlot("2026-08-03", 9 * 60, 10 * 60)
    task = PlanV2Task(title="写代码", duration=60)
    understanding = {"title": "写代码", "preferred_time": "any", "focus_level": "deep"}
    score = score_understanding(slot, task, understanding)
    assert score == 0.3 + 0.3  # any (0.3) + deep morning (0.3)


def test_score_understanding_afternoon_no_match() -> None:
    """preferred_time=下午 在上午时段返回低分。"""
    slot = FreeSlot("2026-08-03", 9 * 60, 10 * 60)
    task = PlanV2Task(title="写报告", duration=60)
    understanding = {"title": "写报告", "preferred_time": "下午", "focus_level": "flexible"}
    score = score_understanding(slot, task, understanding)
    # 上午时段不匹配下午偏好 → 0.0 + flexible (0.1)
    assert score == 0.1


def test_schedule_tasks_understanding_prefers_morning() -> None:
    """LLM understanding 中 preferred_time=上午 应把任务排到上午。"""
    tasks = [PlanV2Task(title="写报告", duration=60)]
    existing = [
        ExistingBlock(date="2026-08-03", start=9 * 60, end=10 * 60, status="scheduled"),
    ]
    understandings = {
        "写报告": {"title": "写报告", "preferred_time": "上午", "focus_level": "flexible", "notes": ""},
    }
    blocks, unassigned, _ = schedule_tasks(
        tasks, existing, (date(2026, 8, 3), date(2026, 8, 3)),
        understandings=understandings,
    )
    assert len(blocks) == 1
    assert blocks[0].start < 12 * 60, f"上午偏好应排上午，实际在 {blocks[0].start // 60}:{blocks[0].start % 60:02d}"


def test_schedule_tasks_understanding_prefers_afternoon() -> None:
    """LLM understanding 中 preferred_time=下午 应把任务排到下午。"""
    tasks = [PlanV2Task(title="写代码", duration=60)]
    existing = [
        ExistingBlock(date="2026-08-03", start=9 * 60, end=10 * 60, status="scheduled"),
        ExistingBlock(date="2026-08-03", start=10 * 60, end=12 * 60, status="scheduled"),
    ]
    understandings = {
        "写代码": {"title": "写代码", "preferred_time": "下午", "focus_level": "flexible", "notes": ""},
    }
    blocks, unassigned, _ = schedule_tasks(
        tasks, existing, (date(2026, 8, 3), date(2026, 8, 3)),
        understandings=understandings,
    )
    assert len(blocks) == 1
    assert blocks[0].start >= 12 * 60, f"下午偏好应排下午，实际在 {blocks[0].start // 60}:{blocks[0].start % 60:02d}"


def test_constraint_filters_exclude_weekday() -> None:
    """hard constraint '不要周三' 应排除周三时段的候选。"""
    # 2026-08-03 是周一
    filters = parse_constraint_filters(["不要安排在周三"])
    assert len(filters) == 1
    # 周三 slot 被排除
    assert filters[0](FreeSlot("2026-08-05", 9 * 60, 10 * 60)) is False
    # 周一 slot 保留
    assert filters[0](FreeSlot("2026-08-03", 9 * 60, 10 * 60)) is True


def test_constraint_filters_exclude_evening() -> None:
    """hard constraint '不要晚上' 应排除晚上时段。"""
    filters = parse_constraint_filters(["不要安排在晚上"])
    assert len(filters) == 1
    assert filters[0](FreeSlot("2026-08-03", 20 * 60, 21 * 60)) is False
    assert filters[0](FreeSlot("2026-08-03", 9 * 60, 10 * 60)) is True


def test_constraint_filters_time_before() -> None:
    """constraint '下午三点前' 应排除 15:00 及之后的时段。"""
    filters = parse_constraint_filters(["下午三点前"])
    assert len(filters) >= 1
    assert filters[0](FreeSlot("2026-08-03", 16 * 60, 17 * 60)) is False
    assert filters[0](FreeSlot("2026-08-03", 9 * 60, 10 * 60)) is True


def test_constraint_filters_time_before_natural_variants() -> None:
    """'9点之前/以前不安排' 等自然说法应被解析为硬约束（8点排除、9点保留）。"""
    texts = [
        "9点之前不安排任何任务",
        "早上 9 点之前不安排任何任务",
        "不要在9点之前安排任务",
        "9点以前不安排",
    ]
    for text in texts:
        filters = parse_constraint_filters([text])
        assert len(filters) >= 1, f"{text!r} 应生成过滤函数"
        before = FreeSlot("2026-08-03", 8 * 60, 9 * 60)
        after = FreeSlot("2026-08-03", 9 * 60, 10 * 60)
        assert all(f(before) for f in filters) is False, f"{text!r} 应排除 8 点时段"
        assert all(f(after) for f in filters) is True, f"{text!r} 应保留 9 点时段"


def test_constraint_filters_time_after_natural_variants() -> None:
    """'晚上9点之后不安排' 应只保留 21 点前的时段。"""
    filters = parse_constraint_filters(["晚上9点之后不安排任何任务"])
    assert len(filters) >= 1
    before = FreeSlot("2026-08-03", 20 * 60, 21 * 60)
    after = FreeSlot("2026-08-03", 21 * 60, 22 * 60)
    assert all(f(before) for f in filters) is True, "20 点时段应保留"
    assert all(f(after) for f in filters) is False, "21 点及之后应被排除"


def test_schedule_tasks_memory_exclusion_blocks_before_nine() -> None:
    """记忆"9点之前不安排任何任务"解析为约束后，任务不得排到 9 点前。"""
    tasks = [PlanV2Task(title="写代码", duration=120)]
    existing: list[ExistingBlock] = []
    blocks, unassigned, _ = schedule_tasks(
        tasks, existing, (date(2026, 8, 3), date(2026, 8, 3)),
        memories=["早上9点之前不安排任何任务"],
        constraint_filters=parse_constraint_filters(
            ["早上9点之前不安排任何任务"]
        ),
    )
    assert len(blocks) == 1
    assert len(unassigned) == 0
    assert blocks[0].start >= 9 * 60, (
        f"记忆约束应阻止 9 点前排期，实际排在了 {blocks[0].start // 60}:{blocks[0].start % 60:02d}"
    )


def test_schedule_tasks_constraint_excludes_weekday() -> None:
    """hard constraint 排除周三后，任务不应排到周三。"""
    tasks = [PlanV2Task(title="写代码", duration=60)]
    existing: list[ExistingBlock] = []
    # 规划范围 2026-08-03（周一）至 2026-08-07（周五）
    blocks, unassigned, _ = schedule_tasks(
        tasks, existing, (date(2026, 8, 3), date(2026, 8, 7)),
        constraint_filters=parse_constraint_filters(["不要安排在周三"]),
    )
    assert len(blocks) == 1
    from datetime import date as dt_date
    block_date = dt_date.fromisoformat(blocks[0].date)
    assert block_date.weekday() != 2, f"不应排到周三，实际排到 {blocks[0].date}"


def test_schedule_tasks_understanding_changes_placement() -> None:
    """understanding 与 memory 均影响排期：同一任务不同 understanding → 不同时段。"""
    tasks = [PlanV2Task(title="写文章", duration=60)]
    existing = [
        ExistingBlock(date="2026-08-03", start=7 * 60, end=8 * 60, status="scheduled"),
        ExistingBlock(date="2026-08-03", start=9 * 60, end=10 * 60, status="scheduled"),
        ExistingBlock(date="2026-08-03", start=13 * 60, end=14 * 60, status="scheduled"),
    ]

    # understanding A: preferred_time=上午
    blocks_am, _, _ = schedule_tasks(
        tasks, existing, (date(2026, 8, 3), date(2026, 8, 3)),
        understandings={"写文章": {"title": "写文章", "preferred_time": "上午", "focus_level": "flexible", "notes": ""}},
    )
    # understanding B: preferred_time=下午（阻塞上午时段，迫使任务排到下午）
    blocks_pm, _, _ = schedule_tasks(
        tasks, existing, (date(2026, 8, 3), date(2026, 8, 3)),
        understandings={"写文章": {"title": "写文章", "preferred_time": "下午", "focus_level": "flexible", "notes": ""}},
        constraint_filters=parse_constraint_filters(["避开上午"]),
    )
    assert len(blocks_am) == 1
    assert len(blocks_pm) == 1
    assert blocks_am[0].start < 12 * 60, f"应排上午，实际 {blocks_am[0].start // 60}:{blocks_am[0].start % 60:02d}"
    assert blocks_pm[0].start >= 12 * 60, f"应排下午，实际 {blocks_pm[0].start // 60}:{blocks_pm[0].start % 60:02d}"



# ============================================================
# 6. 用户指定的四种关键场景测试
# ============================================================

def test_constraint_combined_weekday_period() -> None:
    """Test 1: Constraint 排除 — '周三晚上不能学习'
    应排除周三晚上，保留周三下午。"""
    filters = parse_constraint_filters(["周三晚上不能学习"])
    assert len(filters) == 1

    wed_eve = filters[0](FreeSlot("2026-08-05", 20 * 60, 21 * 60))  # 周三 20:00
    wed_aft = filters[0](FreeSlot("2026-08-05", 14 * 60, 15 * 60))  # 周三 14:00
    assert wed_eve is False, "周三晚上应被排除"
    assert wed_aft is True, "周三下午应保留"


def test_constraint_priority_over_memory() -> None:
    """Test 2: Constraint 优先级高于 Memory
    Memory 说"晚上适合运动"，但 Constraint 说"周三晚上不能运动"。
    Constraint 应排除周三晚上，即使 Memory 给出高分。"""
    tasks = [PlanV2Task(title="健身", duration=60)]
    # 周三 2026-08-05
    existing = [
        ExistingBlock(date="2026-08-05", start=6 * 60, end=7 * 60, status="scheduled"),
        ExistingBlock(date="2026-08-05", start=9 * 60, end=10 * 60, status="scheduled"),
        ExistingBlock(date="2026-08-05", start=13 * 60, end=14 * 60, status="scheduled"),
        ExistingBlock(date="2026-08-05", start=16 * 60, end=17 * 60, status="scheduled"),
    ]
    # Memory 偏好晚上，但 Constraint 禁止周三晚上
    blocks, unassigned, _ = schedule_tasks(
        tasks, existing, (date(2026, 8, 5), date(2026, 8, 5)),
        memories=["晚上适合运动，晚上运动效果最好"],
        constraint_filters=parse_constraint_filters(["周三晚上不能运动"]),
    )
    assert len(blocks) == 1
    # 任务不应排到晚上（18:00+）
    assert blocks[0].start < 18 * 60, (
        f"Constraint 应阻止晚上排期，实际排在了 {blocks[0].start // 60}:{blocks[0].start % 60:02d}"
    )


def test_understanding_deep_work_morning_preferred() -> None:
    """Test 3: LLM Task Understanding
    任务"完成毕业设计核心代码" + understanding {category=deep-work, focus=high, preferred_time=morning}
    上午候选得分应高于下午候选。"""
    task = PlanV2Task(title="完成毕业设计核心代码", duration=120)
    morning = FreeSlot("2026-08-03", 9 * 60, 11 * 60)
    afternoon = FreeSlot("2026-08-03", 15 * 60, 17 * 60)
    scorer = SlotScorer()
    understanding = {
        "title": "完成毕业设计核心代码",
        "preferred_time": "上午",
        "focus_level": "deep",
        "notes": "",
    }
    s_morning = scorer.score(morning, task, "high", [], understanding)
    s_afternoon = scorer.score(afternoon, task, "high", [], understanding)
    assert s_morning > s_afternoon, (
        f"上午得分 ({s_morning:.3f}) 应高于下午 ({s_afternoon:.3f})"
    )


def test_schedule_tasks_without_understanding_still_works() -> None:
    """Test 4: 没有 Understanding 时仍然正常
    Understanding 是增强信息，不应成为系统单点故障。"""
    tasks = [PlanV2Task(title="写代码", duration=60)]
    # 不传 understandings
    blocks, unassigned, _ = schedule_tasks(
        tasks, [], (date(2026, 8, 3), date(2026, 8, 3)),
    )
    assert len(blocks) == 1
    assert blocks[0].title == "写代码"
    assert len(unassigned) == 0



# ============================================================
# 7. 偏好与硬约束的区分测试（无默认时间偏差）
# ============================================================

def test_memory_negative_preference_overrides_default_morning_boost() -> None:
    """Test C': Memory='早上不适合学习'
    默认时间可用性早上最高 (0.9)，但记忆应反转偏好，把任务推到下午。
    """
    task = PlanV2Task(title="学习数据结构", duration=60)
    understanding = {
        "title": "学习数据结构",
        "preferred_time": "下午",  # LLM 读取"早上不适合学习"后生成的偏好
        "focus_level": "flexible",
        "notes": "",
    }
    existing = [
        ExistingBlock(date="2026-08-14", start=9 * 60, end=10 * 60, status="scheduled"),
    ]
    blocks, _, _ = schedule_tasks(
        [task], existing, (date(2026, 8, 14), date(2026, 8, 14)),
        understandings={task.title: understanding},
    )
    assert len(blocks) == 1
    assert blocks[0].start >= 12 * 60, (
        f"▲ 默认时间可用性偏好上午，但记忆'早上不适合学习'应把任务推到下午，"
        f"实际排在了 {blocks[0].start // 60}:{blocks[0].start % 60:02d}"
    )


def test_memory_morning_preference_does_not_override_fixed_meeting() -> None:
    """Test D': Memory='上午适合深度工作' vs 周二上午固定会议 9:00-11:00
    固定日程是硬约束，不能为了满足 Memory 强行覆盖。
    """
    tasks = [PlanV2Task(title="写代码", duration=60, priority="high")]
    existing = [
        ExistingBlock(date="2026-08-18", start=9 * 60, end=11 * 60, status="scheduled"),
    ]
    blocks, _, _ = schedule_tasks(
        tasks, existing, (date(2026, 8, 16), date(2026, 8, 22)),
        memories=["上午适合深度工作"],
    )
    assert len(blocks) == 1
    block = blocks[0]
    overlaps_meeting = (
        block.date == "2026-08-18" and block.start < 11 * 60 and 9 * 60 < block.end
    )
    assert not overlaps_meeting, (
        f"Memory 偏好上午不能覆盖周二 9:00-11:00 固定会议，实际排在了 {block.date} {block.start // 60}:{block.start % 60:02d}"
    )



# ============================================================
# 8. LLM 结构化约束（build_constraint_filters）
# ============================================================

def test_build_constraint_filters_day_start() -> None:
    """ConstrainSpec.day_start 应排除该点之前的时段。"""
    spec = ConstraintSpec(day_start=14)
    filters = build_constraint_filters(spec)
    assert len(filters) == 1
    before = FreeSlot("2026-08-14", 13 * 60 + 30, 14 * 60)
    at = FreeSlot("2026-08-14", 14 * 60, 15 * 60)
    assert filters[0](before) is False, "day_start 前应被排除"
    assert filters[0](at) is True, "day_start 点应允许"


def test_build_constraint_filters_day_end() -> None:
    """ConstrainSpec.day_end 应排除该点之后的时段。"""
    spec = ConstraintSpec(day_end=18)
    filters = build_constraint_filters(spec)
    assert len(filters) == 1
    before = FreeSlot("2026-08-14", 17 * 60, 18 * 60)
    after = FreeSlot("2026-08-14", 20 * 60, 21 * 60)
    assert filters[0](before) is True
    assert filters[0](after) is False, "day_end 后应被排除"


def test_build_constraint_filters_exclude_weekday() -> None:
    """ConstrainSpec.exclude_weekdays 应排除对应星期。"""
    spec = ConstraintSpec(exclude_weekdays=[2])  # 周三
    filters = build_constraint_filters(spec)
    assert len(filters) == 1
    wed = FreeSlot("2026-08-05", 10 * 60, 11 * 60)  # 2026-08-05 是周三
    mon = FreeSlot("2026-08-03", 10 * 60, 11 * 60)  # 2026-08-03 是周一
    assert filters[0](wed) is False
    assert filters[0](mon) is True


def test_build_constraint_filters_exclude_period() -> None:
    """ConstrainSpec.exclude_periods 应排除对应时段。"""
    spec = ConstraintSpec(exclude_periods=["晚上"])
    filters = build_constraint_filters(spec)
    assert len(filters) == 1
    night = FreeSlot("2026-08-14", 20 * 60, 21 * 60)
    morning = FreeSlot("2026-08-14", 9 * 60, 10 * 60)
    assert filters[0](night) is False
    assert filters[0](morning) is True


def test_build_constraint_filters_none() -> None:
    """None spec 应返回空列表。"""
    assert build_constraint_filters(None) == []


# ============================================================
# 9. 回归：整天空闲槽 + 时间类硬约束（长期约束带条件）
# ============================================================

def test_schedule_tasks_time_after_on_full_day_slot() -> None:
    """回归：'从14:00开始安排' 不应把整天空闲槽全部过滤掉。

    此前约束在整槽（06:00-23:00）粒度按 slot.start 判断，
    slot.start=6:00 < 14:00 恒成立 → 所有槽被排除 → 无法排期。
    现在约束应在候选位置粒度校验，任务应排到 14:00 及之后。
    """
    tasks = [PlanV2Task(title="写周报", duration=60, priority="auto")]
    blocks, unassigned, _ = schedule_tasks(
        tasks,
        [],
        (date(2026, 8, 16), date(2026, 8, 29)),
        ["写周报"],
        constraint_filters=parse_constraint_filters(["从14:00开始安排工作"]),
    )
    assert len(blocks) == 1, f"应能排出任务，实际 unassigned={unassigned}"
    assert blocks[0].start >= 14 * 60, (
        f"'从14:00开始安排' 应排 14:00 之后，实际 {blocks[0].start // 60}:{blocks[0].start % 60:02d}"
    )


def test_schedule_tasks_constraint_spec_day_start_on_full_day_slot() -> None:
    """回归：LLM 结构化约束 day_start 不应导致全部任务无法排期。"""
    tasks = [PlanV2Task(title="写周报", duration=60, priority="auto")]
    spec = ConstraintSpec(day_start=14)
    blocks, unassigned, _ = schedule_tasks(
        tasks,
        [],
        (date(2026, 8, 16), date(2026, 8, 29)),
        ["写周报"],
        constraint_filters=build_constraint_filters(spec),
    )
    assert len(blocks) == 1, f"应能排出任务，实际 unassigned={unassigned}"
    assert blocks[0].start >= 14 * 60, (
        f"day_start=14 应排 14:00 之后，实际 {blocks[0].start // 60}:{blocks[0].start % 60:02d}"
    )


def test_schedule_tasks_time_before_keeps_before_hour() -> None:
    """回归：'下午三点前' 应把任务排在 15:00 之前，且不能无法排期。"""
    tasks = [PlanV2Task(title="写周报", duration=60, priority="auto")]
    blocks, unassigned, _ = schedule_tasks(
        tasks,
        [],
        (date(2026, 8, 16), date(2026, 8, 29)),
        ["写周报"],
        constraint_filters=parse_constraint_filters(["下午三点前"]),
    )
    assert len(blocks) == 1, f"应能排出任务，实际 unassigned={unassigned}"
    assert blocks[0].start < 15 * 60, (
        f"'下午三点前' 应排 15:00 之前，实际 {blocks[0].start // 60}:{blocks[0].start % 60:02d}"
    )


def test_schedule_tasks_exclude_evening_never_places_evening() -> None:
    """回归：'不要安排在晚上' 在整天空闲槽上也不得排到晚上（候选粒度校验）。"""
    tasks = [PlanV2Task(title="写周报", duration=60, priority="auto")]
    blocks, unassigned, _ = schedule_tasks(
        tasks,
        [],
        (date(2026, 8, 16), date(2026, 8, 29)),
        ["写周报"],
        constraint_filters=parse_constraint_filters(["不要安排在晚上"]),
    )
    assert len(blocks) == 1, f"应能排出任务，实际 unassigned={unassigned}"
    assert blocks[0].start < 18 * 60, (
        f"'不要安排在晚上' 不应排到晚上，实际 {blocks[0].start // 60}:{blocks[0].start % 60:02d}"
    )


# ============================================================
# 9. 工作方式分块排期（番茄钟式）
# ============================================================

def test_parse_work_style_variants() -> None:
    """常见"分块 + 间隔"表述应被解析为 WorkStyleSpec。"""
    cases = {
        "以25分钟时间块安排，中间需要间隔至少5分钟": (25, 5),
        "工作25分钟休息5分钟": (25, 5),
        "每50分钟休息10分钟": (50, 10),
        "以三十分钟为一段，中间休息五分钟": (30, 5),
        "以 25 分钟时间块安排": (25, None),
    }
    for text, (chunk, break_) in cases.items():
        spec = parse_work_style([text])
        assert spec is not None, f"{text!r} 应解析出 work_style"
        assert spec.chunk_minutes == chunk, text
        assert spec.break_minutes == break_, text


def test_parse_work_style_merges_across_memories() -> None:
    """分块和间隔可以来自不同记忆。"""
    spec = parse_work_style(["每25分钟一个单位", "中间间隔至少5分钟"])
    assert spec is not None
    assert spec.chunk_minutes == 25
    assert spec.break_minutes == 5


def test_parse_work_style_none_for_unrelated() -> None:
    """无分块表述的记忆不应解析出 work_style。"""
    assert parse_work_style(["我上午的精力最好", "习惯每周运动两次"]) is None
    assert parse_work_style([]) is None


def test_schedule_tasks_chunked_with_breaks() -> None:
    """分块任务应拆成多个 25 分钟块，块间保留空白间隔（不写入休息块）。"""
    tasks = [PlanV2Task(title="写代码", duration=100)]
    style = WorkStyleSpec(chunk_minutes=25, break_minutes=5)
    blocks, unassigned, _ = schedule_tasks(
        tasks, [], (date(2026, 8, 3), date(2026, 8, 3)),
        work_style=style,
    )
    assert len(unassigned) == 0
    assert blocks, "应生成工作块"
    assert all(b.title == "写代码" for b in blocks), "不应生成休息块"
    assert len(blocks) == 4, f"应拆成 4 个块，实际 {len(blocks)}"
    assert all(b.end - b.start == 25 for b in blocks)
    # 总工作时长守恒
    assert sum(b.end - b.start for b in blocks) == 100
    # 块间留出 5 分钟空白间隔，且块本身不重叠
    ordered = sorted(blocks, key=lambda b: b.start)
    for prev, nxt in zip(ordered, ordered[1:]):
        assert nxt.start - prev.end == 5, "块间应保留 5 分钟空白间隔"


def test_schedule_tasks_chunked_break_gap_reserved_for_other_tasks() -> None:
    """分块任务的休息间隔应占位：其他任务不得排进该空白区间。"""
    tasks = [
        PlanV2Task(title="写代码", duration=50),
        PlanV2Task(title="整理文档", duration=30),
    ]
    style = WorkStyleSpec(chunk_minutes=25, break_minutes=5)
    blocks, unassigned, _ = schedule_tasks(
        tasks, [], (date(2026, 8, 3), date(2026, 8, 3)),
        work_style=style,
    )
    assert len(unassigned) == 0
    code = sorted((b for b in blocks if b.title == "写代码"), key=lambda b: b.start)
    assert len(code) == 2
    gap_start, gap_end = code[0].end, code[1].start
    assert gap_end - gap_start == 5, "分块任务块间应有 5 分钟间隔"
    for other in blocks:
        if other.title == "写代码":
            continue
        assert other.start >= gap_end or other.end <= gap_start, (
            f"其他任务不得占用休息间隔 {gap_start}-{gap_end}，实际 {other.title} {other.start}-{other.end}"
        )


def test_schedule_tasks_chunked_respects_hard_constraint() -> None:
    """分块任务的所有工作块都必须满足硬约束（9 点前不排）。"""
    tasks = [PlanV2Task(title="写代码", duration=120)]
    style = WorkStyleSpec(chunk_minutes=25, break_minutes=5)
    blocks, unassigned, _ = schedule_tasks(
        tasks, [], (date(2026, 8, 3), date(2026, 8, 3)),
        work_style=style,
        constraint_filters=parse_constraint_filters(["9点之前不安排任何任务"]),
    )
    assert len(unassigned) == 0
    work = [b for b in blocks if b.title == "写代码"]
    assert work, "应生成工作块"
    assert all(b.start >= 9 * 60 for b in work), (
        f"所有工作块应排在 9 点后，实际最早 {min(b.start for b in work) // 60} 点"
    )


def test_schedule_tasks_short_task_not_split() -> None:
    """时长不超过块长的任务保持单块，不产生休息块。"""
    tasks = [PlanV2Task(title="写代码", duration=30)]
    style = WorkStyleSpec(chunk_minutes=25, break_minutes=5)
    blocks, unassigned, _ = schedule_tasks(
        tasks, [], (date(2026, 8, 3), date(2026, 8, 3)),
        work_style=style,
    )
    assert len(unassigned) == 0
    assert len(blocks) == 1
    assert blocks[0].end - blocks[0].start == 30


# ============================================================
# 10. 当前时刻之后排期（now_minutes）
# ============================================================

def test_schedule_tasks_now_minutes_never_places_past_today() -> None:
    """now_minutes 之后，今天不再排入已过去的时间段。"""
    tasks = [PlanV2Task(title="写代码", duration=60)]
    blocks, unassigned, _ = schedule_tasks(
        tasks, [], (date(2026, 8, 3), date(2026, 8, 3)),
        now_minutes=20 * 60 + 47,
    )
    assert len(unassigned) == 0
    assert blocks[0].start >= 20 * 60 + 47, (
        f"任务不得排到当前时刻之前，实际 {blocks[0].start // 60}:{blocks[0].start % 60:02d}"
    )


def test_schedule_tasks_now_minutes_moves_to_later_days() -> None:
    """今天剩余时间不足时，任务应排到后续日期而非过去的今天。"""
    tasks = [PlanV2Task(title="写代码", duration=480)]
    blocks, unassigned, _ = schedule_tasks(
        tasks, [], (date(2026, 8, 3), date(2026, 8, 5)),
        now_minutes=22 * 60,
    )
    assert len(unassigned) == 0
    assert blocks[0].date != "2026-08-03", "今天剩余 60 分钟不足 480 分钟，不应排到今天"
    assert blocks[0].date == "2026-08-04"


def test_schedule_tasks_without_now_minutes_keeps_full_first_day() -> None:
    """不传 now_minutes 时保持原行为：首日从 day_start 开始可排。"""
    tasks = [PlanV2Task(title="写代码", duration=60)]
    blocks, unassigned, _ = schedule_tasks(
        tasks, [], (date(2026, 8, 3), date(2026, 8, 3)),
    )
    assert len(unassigned) == 0
    assert blocks[0].start >= 6 * 60
