"""测试 planner 模块 — 时间块清洗上限与 v1 规划空结果路径。"""

from __future__ import annotations

import asyncio
from datetime import date

from app.config import Settings
from app.schemas import ExistingBlock, PlanRequest, PlanTaskInput
from app.services.planner import (
    _sanitize_planned_block,
    breakdown_tasks,
    plan_schedule,
)


def run(coro):
    return asyncio.run(coro)


def _plan_request(**overrides) -> PlanRequest:
    payload = {
        "tasks": [PlanTaskInput(name="写报告")],
        "start_date": "2026-09-01",
        "horizon_days": 1,
    }
    payload.update(overrides)
    return PlanRequest(**payload)


def _patch_deepseek(monkeypatch, content: str) -> None:
    async def fake_chat(*args, **kwargs):
        return {"choices": [{"message": {"content": content}}]}

    monkeypatch.setattr("app.services.planner.call_chat_completions", fake_chat)
    monkeypatch.setattr(
        "app.services.planner.resolve_ai_provider",
        lambda *args, **kwargs: ("deepseek", None),
    )


def test_sanitize_planned_block_caps_duration_at_60_minutes() -> None:
    block = _sanitize_planned_block(
        {"name": "写报告", "date": "2026-09-01", "start": 600, "end": 690},
        date(2026, 9, 1),
        date(2026, 9, 1),
    )
    assert block is not None
    assert (block.start, block.end) == (600, 660)


def test_sanitize_planned_block_keeps_minimum_15_minutes() -> None:
    block = _sanitize_planned_block(
        {"name": "散步", "date": "2026-09-01", "start": 600, "end": 605},
        date(2026, 9, 1),
        date(2026, 9, 1),
    )
    assert block is not None
    assert (block.start, block.end) == (600, 615)


def test_sanitize_planned_block_truncates_at_day_end() -> None:
    block = _sanitize_planned_block(
        {"name": "夜跑", "date": "2026-09-01", "start": 1400, "end": 1500},
        date(2026, 9, 1),
        date(2026, 9, 1),
    )
    assert block is not None
    assert (block.start, block.end) == (1400, 1439)


def test_plan_schedule_empty_ai_result_returns_message_not_conflict_error(
    monkeypatch,
) -> None:
    _patch_deepseek(monkeypatch, '{"blocks":[]}')
    response = run(plan_schedule(_plan_request(), Settings()))
    assert response.source == "deepseek"
    assert response.blocks == []
    assert response.blocked == []
    assert response.message is not None
    assert "全部与已有安排冲突" not in response.message


def test_plan_schedule_all_conflicting_blocks_reports_conflict(monkeypatch) -> None:
    _patch_deepseek(
        monkeypatch,
        '{"blocks":[{"name":"写报告","date":"2026-09-01","start":600,"end":660,'
        '"category":"work","location":""}]}',
    )
    request = _plan_request(
        existing_blocks=[ExistingBlock(date="2026-09-01", start=600, end=660)],
    )
    response = run(plan_schedule(request, Settings()))
    assert response.source == "none"
    assert response.blocks == []
    assert response.message is not None
    assert "全部与已有安排冲突" in response.message


def test_plan_schedule_returns_valid_blocks(monkeypatch) -> None:
    _patch_deepseek(
        monkeypatch,
        '{"blocks":[{"name":"写报告","date":"2026-09-01","start":600,"end":660,'
        '"category":"work","location":""}]}',
    )
    response = run(plan_schedule(_plan_request(), Settings()))
    assert response.source == "deepseek"
    assert len(response.blocks) == 1
    assert (response.blocks[0].start, response.blocks[0].end) == (600, 660)
    assert response.message is None


def test_breakdown_ai_rejected_returns_failure_message(monkeypatch) -> None:
    _patch_deepseek(monkeypatch, '{"error": "未识别到有效项目计划"}')
    response = run(
        breakdown_tasks("今天天气不错", "deepseek", "2026-08-29", Settings())
    )
    assert response.source == "none"
    assert response.tasks == []
    assert response.message is not None
    assert response.message.startswith("AI 拆解失败")
    assert "未识别到有效项目计划" in response.message


def test_breakdown_empty_ai_tasks_falls_back_to_failure_message(monkeypatch) -> None:
    _patch_deepseek(monkeypatch, '{"tasks": []}')
    response = run(
        breakdown_tasks("今天天气不错", "deepseek", "2026-08-29", Settings())
    )
    assert response.source == "none"
    assert response.tasks == []
    assert response.message is not None
    assert "AI 未返回任务列表" in response.message
