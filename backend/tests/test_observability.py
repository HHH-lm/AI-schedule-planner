"""后端可观测性测试：结构化日志格式与关键事件埋点。"""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timedelta, timezone

import httpx
import pytest
from fastapi.testclient import TestClient

from app.config import Settings, get_settings
from app.logging_setup import (
    JsonFormatter,
    get_logger,
    log_event,
    reset_request_id,
    set_request_id,
    setup_logging,
)
from app.main import app
from app.services.ai import call_chat_completions
from app.services.push import push_wechat_message
from app.services.reminders import scan_reminders


app.dependency_overrides[get_settings] = lambda: Settings(
    ai_provider="local", openai_api_key="", deepseek_api_key=""
)


client = TestClient(app)


def _records(caplog, event_name: str) -> list:
    return [r for r in caplog.records if getattr(r, "event", None) == event_name]


def run(coro):
    return asyncio.run(coro)


# ── 基础设施 ───────────────────────────────────────────────


def test_json_formatter_emits_structured_line() -> None:
    formatter = JsonFormatter()
    record = logging.LogRecord(
        name="app.services.ai",
        level=logging.INFO,
        pathname=__file__,
        lineno=1,
        msg="ai.response",
        args=(),
        exc_info=None,
    )
    record.event = "ai.response"
    record.fields = {"provider": "deepseek", "duration_ms": 123.4}
    payload = json.loads(formatter.format(record))
    assert payload["event"] == "ai.response"
    assert payload["level"] == "INFO"
    assert payload["logger"] == "app.services.ai"
    assert payload["provider"] == "deepseek"
    assert payload["duration_ms"] == 123.4
    assert "time" in payload


def test_json_formatter_includes_request_id_from_context() -> None:
    formatter = JsonFormatter()
    token = set_request_id("req-abc123")
    try:
        record = logging.LogRecord(
            name="app.ai", level=logging.INFO, pathname=__file__,
            lineno=1, msg="ai.request", args=(), exc_info=None,
        )
        record.event = "ai.request"
        payload = json.loads(formatter.format(record))
        assert payload["request_id"] == "req-abc123"
    finally:
        reset_request_id(token)


def test_log_event_attaches_event_and_fields(caplog) -> None:
    logger = get_logger("app.test")
    with caplog.at_level(logging.INFO, logger="app.test"):
        log_event(logger, logging.INFO, "test.event", foo=1, bar="x")
    records = _records(caplog, "test.event")
    assert len(records) == 1
    assert records[0].fields == {"foo": 1, "bar": "x"}


def test_setup_logging_is_idempotent() -> None:
    root = logging.getLogger()
    setup_logging("INFO", "json")
    count = len(root.handlers)
    assert count >= 1
    setup_logging("INFO", "json")
    setup_logging("DEBUG", "text")
    assert len(root.handlers) == count


# ── HTTP 中间件 ────────────────────────────────────────────


def test_http_middleware_logs_request(caplog) -> None:
    with caplog.at_level(logging.INFO, logger="app"):
        response = client.get("/api/v1/health")
    assert response.status_code == 200
    events = _records(caplog, "http.request")
    assert events
    fields = events[-1].fields
    assert fields["method"] == "GET"
    assert fields["path"] == "/api/v1/health"
    assert fields["status"] == 200
    assert fields["duration_ms"] >= 0
    assert fields["request_id"]


def test_parse_result_event_logged(caplog) -> None:
    with caplog.at_level(logging.INFO, logger="app"):
        response = client.post(
            "/api/v1/parse",
            json={"text": "周二下午2点到5点写代码", "today": "2026-08-03"},
        )
    assert response.status_code == 200
    assert response.json()["source"] == "local"
    result_events = _records(caplog, "parse.result")
    assert result_events
    fields = result_events[-1].fields
    assert fields["source"] == "local"
    assert fields["schedules"] >= 1
    assert fields["duration_ms"] >= 0


# ── AI 调用关键事件 ────────────────────────────────────────


class _FakeAsyncClient:
    def __init__(self, *, response=None, error=None):
        self._response = response
        self._error = error

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def post(self, *args, **kwargs):
        if self._error is not None:
            raise self._error
        return self._response


def test_ai_request_and_response_events(caplog, monkeypatch) -> None:
    settings = Settings(
        deepseek_api_key="test-key",
        deepseek_model="deepseek-chat",
        ai_timeout_ms=5000,
    )
    response = httpx.Response(
        200,
        json={
            "choices": [{"message": {"content": '{"schedules": []}'}}],
        },
    )
    monkeypatch.setattr(
        "app.services.ai.httpx.AsyncClient",
        lambda **kwargs: _FakeAsyncClient(response=response),
    )
    logger = get_logger("app.ai")
    with caplog.at_level(logging.INFO, logger="app.ai"):
        data = run(
            call_chat_completions("sys", "hello", "deepseek", settings, operation="parse")
        )
    assert data["choices"][0]["message"]["content"]
    events = {r.event: r for r in caplog.records if getattr(r, "event", None)}
    assert "ai.request" in events
    assert events["ai.request"].fields["operation"] == "parse"
    assert events["ai.request"].fields["provider"] == "deepseek"
    assert "ai.response" in events
    resp_fields = events["ai.response"].fields
    assert resp_fields["status"] == 200
    assert resp_fields["duration_ms"] >= 0
    assert resp_fields["output_bytes"] >= 0


def test_ai_timeout_event(caplog, monkeypatch) -> None:
    settings = Settings(
        deepseek_api_key="test-key",
        deepseek_model="deepseek-chat",
        ai_timeout_ms=5000,
    )
    monkeypatch.setattr(
        "app.services.ai.httpx.AsyncClient",
        lambda **kwargs: _FakeAsyncClient(
            error=httpx.ConnectTimeout("connect timeout")
        ),
    )
    with caplog.at_level(logging.INFO, logger="app.ai"):
        with pytest.raises(httpx.ConnectTimeout):
            run(
                call_chat_completions("sys", "hello", "deepseek", settings, operation="parse")
            )
    events = {r.event: r for r in caplog.records if getattr(r, "event", None)}
    assert "ai.request" in events
    assert "ai.timeout" in events
    timeout_fields = events["ai.timeout"].fields
    assert timeout_fields["operation"] == "parse"
    assert timeout_fields["timeout_ms"] == 5000
    assert timeout_fields["duration_ms"] >= 0


def test_ai_error_event(caplog, monkeypatch) -> None:
    settings = Settings(
        deepseek_api_key="test-key",
        ai_timeout_ms=5000,
    )
    monkeypatch.setattr(
        "app.services.ai.httpx.AsyncClient",
        lambda **kwargs: _FakeAsyncClient(response=httpx.Response(502, text="bad gateway")),
    )
    with caplog.at_level(logging.INFO, logger="app.ai"):
        with pytest.raises(RuntimeError):
            run(call_chat_completions("sys", "hello", "deepseek", settings))
    events = {r.event: r for r in caplog.records if getattr(r, "event", None)}
    assert "ai.error" in events
    error_fields = events["ai.error"].fields
    assert error_fields["status"] == 502
    assert "bad gateway" in error_fields["error"]


# ── 微信推送关键事件 ───────────────────────────────────────


def _push_settings(**overrides) -> Settings:
    defaults = {
        "wechat_push_type": "wecom",
        "wecom_webhook_url": "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=demo",
    }
    defaults.update(overrides)
    return Settings(**defaults)


def test_push_success_event(caplog) -> None:
    settings = _push_settings()
    transport = httpx.MockTransport(lambda request: httpx.Response(200))
    with caplog.at_level(logging.INFO, logger="app.push"):
        ok = run(push_wechat_message("测试", settings, transport=transport))
    assert ok is True
    events = {r.event: r for r in caplog.records if getattr(r, "event", None)}
    assert "push.request" in events
    assert "push.success" in events
    assert events["push.success"].fields["channel"] == "wecom"


def test_push_failure_event(caplog) -> None:
    settings = _push_settings()
    transport = httpx.MockTransport(lambda request: httpx.Response(500))
    with caplog.at_level(logging.INFO, logger="app.push"):
        ok = run(push_wechat_message("测试", settings, transport=transport))
    assert ok is False
    events = {r.event: r for r in caplog.records if getattr(r, "event", None)}
    assert "push.failure" in events
    fields = events["push.failure"].fields
    assert fields["reason"] == "http_error"
    assert fields["status"] == 500


def test_pushplus_business_error_event(caplog) -> None:
    settings = _push_settings(
        wechat_push_type="pushplus",
        pushplus_token="token",
        wecom_webhook_url=None,
    )
    transport = httpx.MockTransport(
        lambda request: httpx.Response(200, json={"code": 905, "msg": "未实名认证"})
    )
    with caplog.at_level(logging.INFO, logger="app.push"):
        ok = run(push_wechat_message("测试", settings, transport=transport))
    assert ok is False
    events = {r.event: r for r in caplog.records if getattr(r, "event", None)}
    assert "push.failure" in events
    fields = events["push.failure"].fields
    assert fields["reason"] == "business_error"
    assert fields["code"] == 905


# ── 定时提醒关键事件 ───────────────────────────────────────


def _reminder_settings(**overrides) -> Settings:
    defaults = {
        "supabase_url": "https://example.supabase.co",
        "supabase_service_role_key": "service-key",
        "wechat_push_type": "wecom",
        "wecom_webhook_url": "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=demo",
    }
    defaults.update(overrides)
    return Settings(**defaults)


def _row(user_id: str = "u1", blocks: list[dict] | None = None) -> dict:
    return {"user_id": user_id, "data": {"timeBlocks": blocks or []}}


def _async_fake(value):
    async def fake(*args, **kwargs):
        return value

    return fake


def test_scan_reminders_emits_events(caplog, monkeypatch) -> None:
    settings = _reminder_settings()
    recent = datetime.now(timezone.utc)
    b1_remind_at = (recent - timedelta(minutes=4)).isoformat()
    b2_remind_at = (recent - timedelta(minutes=2)).isoformat()
    rows = [
        _row(
            "u1",
            [
                {
                    "id": "b1",
                    "name": "开会",
                    "date": "2026-08-11",
                    "start": 600,
                    "end": 720,
                    "remindAt": b1_remind_at,
                },
                {
                    "id": "b2",
                    "name": "健身",
                    "date": "2026-08-11",
                    "start": 480,
                    "end": 540,
                    "remindAt": b2_remind_at,
                },
            ],
        )
    ]
    monkeypatch.setattr("app.services.reminders.fetch_schedule_rows", _async_fake(rows))
    monkeypatch.setattr(
        "app.services.reminders.fetch_pushed_reminders",
        _async_fake({("u1", "b1", b1_remind_at)}),
    )
    monkeypatch.setattr("app.services.reminders.push_wechat_message", _async_fake(True))
    monkeypatch.setattr("app.services.reminders.insert_reminder_log", _async_fake(None))

    with caplog.at_level(logging.INFO, logger="app.reminders"):
        result = run(scan_reminders(settings))
    assert result["pushed"] == 1
    assert result["skipped"] == 1

    events = {r.event: r for r in caplog.records if getattr(r, "event", None)}
    assert "reminder.scan.start" in events
    assert "reminder.scan.due" in events
    assert "reminder.scan.done" in events
    assert "reminder.push.skipped" in events
    done_fields = events["reminder.scan.done"].fields
    assert done_fields["pushed"] == 1
    assert done_fields["skipped"] == 1
    assert events["reminder.push.skipped"].fields["block_id"] == "b1"


def test_scan_reminders_logs_push_failure(caplog, monkeypatch) -> None:
    settings = _reminder_settings()
    rows = [
        _row(
            "u1",
            [
                {
                    "id": "b1",
                    "name": "开会",
                    "date": "2026-08-11",
                    "start": 600,
                    "end": 720,
                    "remindAt": (datetime.now(timezone.utc) - timedelta(minutes=2)).isoformat(),
                }
            ],
        )
    ]
    monkeypatch.setattr("app.services.reminders.fetch_schedule_rows", _async_fake(rows))
    monkeypatch.setattr("app.services.reminders.fetch_pushed_reminders", _async_fake(set()))

    async def boom_push(_message: str, _settings: Settings) -> bool:
        raise RuntimeError("wecom down")

    monkeypatch.setattr("app.services.reminders.push_wechat_message", boom_push)
    monkeypatch.setattr("app.services.reminders.insert_reminder_log", _async_fake(None))

    with caplog.at_level(logging.INFO, logger="app.reminders"):
        result = run(scan_reminders(settings))
    assert result["errors"] == ["b1: wecom down"]
    events = {r.event: r for r in caplog.records if getattr(r, "event", None)}
    assert "reminder.push.failed" in events
    fields = events["reminder.push.failed"].fields
    assert fields["block_id"] == "b1"
    assert "wecom down" in fields["error"]


def test_scan_reminders_logs_fetch_error(caplog, monkeypatch) -> None:
    settings = _reminder_settings()

    async def boom_fetch(_settings: Settings):
        raise RuntimeError("supabase unreachable")

    monkeypatch.setattr("app.services.reminders.fetch_schedule_rows", boom_fetch)

    with caplog.at_level(logging.INFO, logger="app.reminders"):
        result = run(scan_reminders(settings))
    assert result["errors"] == ["supabase unreachable"]
    events = {r.event: r for r in caplog.records if getattr(r, "event", None)}
    assert "reminder.scan.error" in events
    assert "supabase unreachable" in events["reminder.scan.error"].fields["error"]


# ── 任务匹配关键事件 ───────────────────────────────────────


def test_match_task_error_logged(caplog, monkeypatch) -> None:
    monkeypatch.setattr(
        "app.routers.match_task.resolve_ai_provider",
        lambda *args, **kwargs: ("deepseek", None),
    )

    async def boom(*args, **kwargs):
        raise RuntimeError("provider exploded")

    monkeypatch.setattr("app.routers.match_task.call_chat_completions", boom)

    with caplog.at_level(logging.INFO, logger="app"):
        response = client.post(
            "/api/v1/match-task",
            json={
                "provider": "deepseek",
                "name": "写周报",
                "tasks": [{"id": "t1", "name": "写周报"}],
            },
        )
    assert response.status_code == 200
    # AI 失败后回退本地归一化匹配
    assert response.json()["source"] == "local"
    assert response.json()["taskId"] == "t1"
    error_events = _records(caplog, "match_task.error")
    assert error_events
    assert "provider exploded" in error_events[-1].fields["error"]
    result_events = _records(caplog, "match_task.result")
    assert result_events
    assert result_events[-1].fields["source"] == "local"
    assert result_events[-1].fields["matched"] is True
