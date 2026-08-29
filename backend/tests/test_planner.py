"""测试 planner 模块 — AI 拆解无效输入的结构化错误与失败提示。"""

from __future__ import annotations

import asyncio

from app.config import Settings
from app.services.planner import breakdown_tasks


def run(coro):
    return asyncio.run(coro)


def _patch_deepseek(monkeypatch, content: str) -> None:
    async def fake_chat(*args, **kwargs):
        return {"choices": [{"message": {"content": content}}]}

    monkeypatch.setattr("app.services.planner.call_chat_completions", fake_chat)
    monkeypatch.setattr(
        "app.services.planner.resolve_ai_provider",
        lambda *args, **kwargs: ("deepseek", None),
    )


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
