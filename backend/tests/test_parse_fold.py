"""测试 /parse 折叠编排：随解析一并完成任务匹配与冲突过滤，回填 taskId。"""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app
from app.schemas import ParsedSchedule

client = TestClient(app)

PARSE_BASE = {
    "text": "明天下午2点到3点写代码",
    "provider": "deepseek",
    "api_key": "test-key",
    "today": "2026-09-14",
}


def _patch_parse(monkeypatch, schedules: list[ParsedSchedule]) -> None:
    async def fake_parse_with_ai(text, provider, today, settings, api_key=None):
        return provider, schedules, None, None

    monkeypatch.setattr("app.routers.parse.parse_with_ai", fake_parse_with_ai)


def _patch_match_ai(monkeypatch, task_id: str | None) -> dict:
    calls = {"count": 0}

    async def fake_match(name, tasks, provider, settings, api_key=None):
        calls["count"] += 1
        return task_id

    monkeypatch.setattr("app.routers.parse.match_task_with_ai", fake_match)
    return calls


def test_parse_fold_local_match_skips_ai(monkeypatch) -> None:
    """linkTask 本地包含命中时直接回填 taskId，不再调用 AI 匹配。"""
    schedules = [
        ParsedSchedule(
            name="写代码", date="2026-09-14", start=840, end=900,
            category="work", linkTask="AI schedule 项目",
        )
    ]
    _patch_parse(monkeypatch, schedules)
    match_calls = _patch_match_ai(monkeypatch, None)
    response = client.post(
        "/api/v1/parse",
        json={
            **PARSE_BASE,
            "tasks": [{"id": "t1", "name": "AI schedule"}],
        },
    )
    body = response.json()
    assert response.status_code == 200
    assert body["accepted"][0]["taskId"] == "t1"
    assert body["blocked"] == []
    assert match_calls["count"] == 0


def test_parse_fold_ai_match_fallback_when_local_misses(monkeypatch) -> None:
    """本地未命中（字面差异大）时走 AI 语义匹配并回填 taskId。"""
    schedules = [
        ParsedSchedule(
            name="面试准备", date="2026-09-14", start=80, end=105,
            category="work", linkTask="面试准备时惠环球",
        )
    ]
    _patch_parse(monkeypatch, schedules)
    match_calls = _patch_match_ai(monkeypatch, "t9")
    response = client.post(
        "/api/v1/parse",
        json={
            **PARSE_BASE,
            "tasks": [{"id": "t9", "name": "面试（智尚云+时惠环球）"}],
        },
    )
    body = response.json()
    assert response.status_code == 200
    assert body["accepted"][0]["taskId"] == "t9"
    assert match_calls["count"] == 1


def test_parse_fold_filters_conflicts_and_skips_match_for_blocked(
    monkeypatch,
) -> None:
    """与已有块同时间的块进入 blocked；blocked 不做关联匹配。"""
    schedules = [
        ParsedSchedule(
            name="写代码", date="2026-09-14", start=840, end=900,
            category="work", linkTask="AI schedule",
        )
    ]
    _patch_parse(monkeypatch, schedules)
    match_calls = _patch_match_ai(monkeypatch, "t1")
    response = client.post(
        "/api/v1/parse",
        json={
            **PARSE_BASE,
            "tasks": [{"id": "t1", "name": "AI schedule"}],
            "existing_blocks": [
                {"date": "2026-09-14", "start": 840, "end": 900, "status": "scheduled"}
            ],
        },
    )
    body = response.json()
    assert response.status_code == 200
    assert body["accepted"] == []
    assert len(body["blocked"]) == 1
    assert body["schedules"][0]["taskId"] is None
    assert match_calls["count"] == 0


def test_parse_fold_without_provider_uses_local_match_only(monkeypatch) -> None:
    """本地规则路径同样折叠：本地命中回填 taskId，无 provider 不调 AI。"""
    schedules = [
        ParsedSchedule(
            name="写代码", date="2026-09-14", start=840, end=900,
            category="work", linkTask="AI schedule 项目",
        )
    ]

    def fake_local(text, today):
        return schedules, None

    monkeypatch.setattr(
        "app.routers.parse.parse_schedule_with_feedback", fake_local
    )
    match_calls = _patch_match_ai(monkeypatch, "t1")
    response = client.post(
        "/api/v1/parse",
        json={
            "text": "明天下午2点到3点写代码",
            "today": "2026-09-14",
            "tasks": [{"id": "t1", "name": "AI schedule"}],
        },
    )
    body = response.json()
    assert response.status_code == 200
    assert body["source"] == "local"
    assert body["accepted"][0]["taskId"] == "t1"
    assert match_calls["count"] == 0


def test_parse_fold_absent_context_keeps_legacy_response(monkeypatch) -> None:
    """不带 tasks/existing_blocks 时响应不含折叠字段（向后兼容）。"""
    schedules = [
        ParsedSchedule(name="写代码", date="2026-09-14", start=840, end=900)
    ]
    _patch_parse(monkeypatch, schedules)
    response = client.post("/api/v1/parse", json={**PARSE_BASE})
    body = response.json()
    assert response.status_code == 200
    assert body["accepted"] is None
    assert body["blocked"] is None
    assert body["schedules"][0]["taskId"] is None
