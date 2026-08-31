"""测试 planner_v2 模块 — 记忆驱动的硬约束提取与本地兜底。"""

from __future__ import annotations

from datetime import date

import pytest

from app.config import Settings
from app.schemas import PlanV2Task, PlanV2Request, PlanningWeights
from app.services.planner_v2 import (
    _build_understanding_prompt,
    _exclusion_memories,
    _fallback_constraint_sources,
    _fallback_plan_v2,
    _memory_hashes,
    _understandings_summary,
    plan_v2_schedule,
)


def test_exclusion_memories_filters_only_explicit_prohibitions() -> None:
    """只有带否定/排除关键词的记忆才参与硬约束兜底。"""
    memories = [
        "早上9点之前不安排任何任务",
        "晚上10点后入睡",
        "我上午的精力最好",
        "习惯每周运动两次",
    ]
    result = _exclusion_memories(memories)
    assert result == ["早上9点之前不安排任何任务"]


def test_fallback_constraint_sources_merges_constraints_and_exclusion_memories() -> None:
    request = PlanV2Request(
        tasks=[PlanV2Task(title="写代码", duration=60)],
        memories=["早上9点之前不安排任何任务", "我上午的精力最好"],
        constraints=["不要安排在周三"],
        planning_range={"start": "2026-08-17", "end": "2026-08-18"},
    )
    sources = _fallback_constraint_sources(request)
    assert "不要安排在周三" in sources
    assert "早上9点之前不安排任何任务" in sources
    assert "我上午的精力最好" not in sources


def test_fallback_plan_v2_honors_exclusion_memory() -> None:
    """本地 fallback 也应把排除式记忆解析为硬约束：任务不得排到 9 点前。"""
    tasks = [PlanV2Task(title="写报告", duration=60)]
    response = _fallback_plan_v2(
        tasks,
        [],
        date(2026, 8, 3),
        date(2026, 8, 3),
        memories=["早上9点之前不安排任何任务"],
        constraints=[],
    )
    assert len(response.blocks) == 1
    assert len(response.unassigned) == 0
    assert response.blocks[0].start >= 9 * 60, (
        f"排除式记忆应阻止 9 点前排期，实际排在了 "
        f"{response.blocks[0].start // 60}:{response.blocks[0].start % 60:02d}"
    )


def test_fallback_plan_v2_soft_memory_does_not_block() -> None:
    """软偏好（无排除语义）不应被提升为硬约束。"""
    tasks = [PlanV2Task(title="写报告", duration=60)]
    response = _fallback_plan_v2(
        tasks,
        [],
        date(2026, 8, 3),
        date(2026, 8, 3),
        memories=["我上午的精力最好"],
        constraints=[],
    )
    assert len(response.blocks) == 1
    assert len(response.unassigned) == 0
    # 无硬约束时任务全天可排（默认 00:00-24:00），由评分选择最佳时段


def test_understanding_prompt_requests_constraints_when_only_memories() -> None:
    """只有记忆（无显式 constraints）时，prompt 也必须要求 LLM 输出结构化约束。"""
    prompt = _build_understanding_prompt(
        goal="",
        tasks=[PlanV2Task(title="写报告", duration=60)],
        memories=["早上9点之前不安排任何任务"],
        constraints=[],
        existing=[],
        range_start="2026-08-17",
        range_end="2026-08-18",
    )
    assert "## 约束解析要求" in prompt
    assert "day_start" in prompt


def test_understanding_prompt_without_memories_or_constraints() -> None:
    """既无记忆也无约束时，不需要输出结构化约束。"""
    prompt = _build_understanding_prompt(
        goal="",
        tasks=[PlanV2Task(title="写报告", duration=60)],
        memories=[],
        constraints=[],
        existing=[],
        range_start="2026-08-17",
        range_end="2026-08-18",
    )
    assert "## 约束解析要求" not in prompt


def test_memory_hashes_are_deterministic_and_deidentified() -> None:
    """记忆指纹是稳定的短哈希，不包含原文。"""
    memories = ["早上9点之前不安排任何任务"]
    first = _memory_hashes(memories)
    second = _memory_hashes(memories)
    assert first == second
    assert len(first) == 1
    assert len(first[0]) == 8
    assert "早上" not in first[0]


def test_understandings_summary_aggregates_without_titles() -> None:
    understandings = [
        {"title": "写代码", "category": "work", "preferred_time": "上午", "focus_level": "deep"},
        {"title": "写周报", "category": "work", "preferred_time": "上午", "focus_level": "light"},
    ]
    summary = _understandings_summary(understandings)
    assert summary["preferred_time"] == {"上午": 2}
    assert summary["focus_level"] == {"deep": 1, "light": 1}
    assert summary["categories"] == {"work": 2}
    assert _understandings_summary([]) == {}
    assert _understandings_summary(None) == {}


def test_plan_v2_memory_event_logged_for_exclusion_memory(caplog: pytest.LogCaptureFixture) -> None:
    """本地 fallback 应埋点：排除式记忆被提升为约束并有生效的过滤器。"""
    with caplog.at_level("INFO"):
        _fallback_plan_v2(
            [PlanV2Task(title="写代码", duration=60)],
            [],
            date(2026, 8, 3),
            date(2026, 8, 3),
            memories=["早上9点之前不安排任何任务"],
            constraints=[],
        )
    events = [r for r in caplog.records if getattr(r, "event", None) == "plan_v2.memory"]
    assert len(events) == 1
    fields = events[0].fields
    assert fields["memories_total"] == 1
    assert fields["memories_exclusion"] == 1
    assert fields["explicit_constraints"] == 0
    assert fields["constraint_filters"] == 1
    assert fields["constraint_source"] == "fallback"
    assert len(fields["memory_hashes"]) == 1


def test_plan_v2_memory_event_soft_memory_not_promoted(caplog: pytest.LogCaptureFixture) -> None:
    """普通偏好（无排除语义）不应被提升为约束，日志中 memories_exclusion=0。"""
    with caplog.at_level("INFO"):
        _fallback_plan_v2(
            [PlanV2Task(title="写代码", duration=60)],
            [],
            date(2026, 8, 3),
            date(2026, 8, 3),
            memories=["我上午的精力最好", "习惯每周运动两次"],
            constraints=[],
        )
    events = [r for r in caplog.records if getattr(r, "event", None) == "plan_v2.memory"]
    assert len(events) == 1
    fields = events[0].fields
    assert fields["memories_total"] == 2
    assert fields["memories_exclusion"] == 0
    assert fields["memory_hashes"] is None
    assert fields["constraint_filters"] == 0


def test_plan_v2_schedule_no_provider_logs_memory_event(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """无 AI Key 时 plan_v2_schedule 走本地 fallback 并埋点记忆应用证据。"""
    import asyncio

    settings = Settings(ai_provider="local", openai_api_key="", deepseek_api_key="")
    request = PlanV2Request(
        tasks=[PlanV2Task(title="写报告", duration=60)],
        memories=["早上9点之前不安排任何任务"],
        constraints=[],
        planning_range={"start": "2026-08-17", "end": "2026-08-18"},
    )
    with caplog.at_level("INFO"):
        asyncio.run(plan_v2_schedule(request, settings))
    events = [r for r in caplog.records if getattr(r, "event", None) == "plan_v2.memory"]
    assert len(events) == 1
    assert events[0].fields["constraint_source"] == "fallback"
    assert events[0].fields["constraint_filters"] == 1


def test_fallback_plan_v2_chunked_memory_applies_work_style() -> None:
    """"以25分钟时间块安排，中间需要间隔至少5分钟"应触发分块排期且不写休息块。"""
    response = _fallback_plan_v2(
        [PlanV2Task(title="写代码", duration=120)],
        [],
        date(2026, 8, 3),
        date(2026, 8, 3),
        memories=["以25分钟时间块安排，中间需要间隔至少5分钟"],
        constraints=[],
    )
    assert len(response.unassigned) == 0
    assert response.blocks, "应生成工作块"
    assert all(b.title == "写代码" for b in response.blocks), "不应生成休息块"
    assert len(response.blocks) >= 2, f"应拆分任务，实际 {len(response.blocks)} 个块"
    assert all(b.end - b.start <= 25 for b in response.blocks)
    ordered = sorted(response.blocks, key=lambda b: b.start)
    for prev, nxt in zip(ordered, ordered[1:]):
        assert nxt.start - prev.end == 5, "块间应保留 5 分钟空白间隔"


def test_fallback_plan_v2_logs_work_style(caplog: pytest.LogCaptureFixture) -> None:
    """plan_v2.memory 事件应记录 work_style 及来源。"""
    with caplog.at_level("INFO"):
        _fallback_plan_v2(
            [PlanV2Task(title="写代码", duration=120)],
            [],
            date(2026, 8, 3),
            date(2026, 8, 3),
            memories=["以25分钟时间块安排，中间需要间隔至少5分钟"],
            constraints=[],
        )
    events = [r for r in caplog.records if getattr(r, "event", None) == "plan_v2.memory"]
    assert len(events) == 1
    fields = events[0].fields
    assert fields["work_style"] == {"chunk_minutes": 25, "break_minutes": 5}
    assert fields["work_style_source"] == "fallback"


def test_fallback_plan_v2_respects_now_minutes() -> None:
    """本地 fallback 也应按 now_minutes 不在今天排入过去时间。"""
    response = _fallback_plan_v2(
        [PlanV2Task(title="写报告", duration=60)],
        [],
        date(2026, 8, 3),
        date(2026, 8, 3),
        memories=[],
        constraints=[],
        now_minutes=20 * 60 + 47,
    )
    assert len(response.unassigned) == 0
    assert response.blocks[0].start >= 20 * 60 + 47, (
        f"任务不得排到当前时刻之前，实际 "
        f"{response.blocks[0].start // 60}:{response.blocks[0].start % 60:02d}"
    )


def test_fallback_plan_v2_accepts_custom_weights() -> None:
    """本地 fallback 应透传个性化规划权重并正常排期。"""
    response = _fallback_plan_v2(
        [PlanV2Task(title="写代码", duration=60)],
        [],
        date(2026, 8, 3),
        date(2026, 8, 3),
        memories=[],
        constraints=[],
        weights=PlanningWeights(
            memory=0, understanding=0, time=0, priority=0,
            conflict=1.0, workload=0,
        ),
    )
    assert len(response.unassigned) == 0
    assert len(response.blocks) == 1
