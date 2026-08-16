from __future__ import annotations

import asyncio
from datetime import datetime, timezone

import httpx
from fastapi.testclient import TestClient

from app.config import Settings, get_settings
from app.main import app
from app.services.push import push_channel_ready, push_wechat_message
from app.services.reminders import (
    collect_due_blocks,
    format_reminder_message,
    parse_remind_at,
    scan_reminders,
)


client = TestClient(app)


def run(coro):
    return asyncio.run(coro)


def make_settings(**overrides) -> Settings:
    defaults = {
        "supabase_url": "https://example.supabase.co",
        "supabase_service_role_key": "service-key",
        "wechat_push_type": "wecom",
        "wecom_webhook_url": "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=demo",
    }
    defaults.update(overrides)
    return Settings(**defaults)


def make_row(user_id: str = "u1", blocks: list[dict] | None = None) -> dict:
    return {"user_id": user_id, "data": {"timeBlocks": blocks or []}}


def async_fake(value):
    async def fake(*args, **kwargs):
        return value

    return fake


def test_parse_remind_at() -> None:
    parsed = parse_remind_at("2026-08-11T01:00:00Z")
    assert parsed is not None
    assert parsed.tzinfo is not None
    assert parse_remind_at("not-a-date") is None
    assert parse_remind_at(None) is None


def test_collect_due_blocks_filters_due() -> None:
    now = datetime(2026, 8, 11, 2, 0, tzinfo=timezone.utc)
    rows = [
        make_row(
            "u1",
            [
                {"id": "b1", "name": "开会", "remindAt": "2026-08-11T01:00:00Z"},
                {"id": "b2", "name": "健身", "remindAt": "2026-08-11T03:00:00Z"},
                {"id": "b3", "name": "写代码"},
            ],
        ),
        {"user_id": "u2", "data": {"timeBlocks": [{"id": "b4", "remindAt": "bad"}]}},
        {"user_id": "u3"},
    ]
    due = collect_due_blocks(rows, now)
    assert [item["block"]["id"] for item in due] == ["b1"]


def test_format_reminder_message() -> None:
    message = format_reminder_message(
        {
            "name": "复盘",
            "date": "2026-08-11",
            "start": 14 * 60,
            "end": 15 * 60,
            "location": "深圳湾",
        }
    )
    assert "日程提醒：复盘" in message
    assert "2026-08-11" in message
    assert "14:00-15:00" in message
    assert "深圳湾" in message


def test_push_channel_ready() -> None:
    assert push_channel_ready(make_settings()) is True
    pushplus = make_settings(wechat_push_type="pushplus")
    setattr(pushplus, "pushplus_token", "t")
    assert push_channel_ready(pushplus) is True
    serverchan = make_settings(wechat_push_type="serverchan")
    setattr(serverchan, "serverchan_key", "k")
    assert push_channel_ready(serverchan) is True
    assert push_channel_ready(make_settings(wechat_push_type="none")) is False
    assert push_channel_ready(make_settings(wecom_webhook_url="")) is False


def test_push_wechat_message_wecom() -> None:
    transport = httpx.MockTransport(
        lambda request: httpx.Response(200, json={"errcode": 0})
    )
    ok = run(push_wechat_message("hi", make_settings(), transport=transport))
    assert ok is True


def test_push_wechat_message_failure() -> None:
    transport = httpx.MockTransport(lambda request: httpx.Response(500))
    ok = run(push_wechat_message("hi", make_settings(), transport=transport))
    assert ok is False


def make_pushplus_settings() -> Settings:
    settings = make_settings(wechat_push_type="pushplus")
    setattr(settings, "pushplus_token", "demo-token")
    return settings


def test_pushplus_business_error_is_failure() -> None:
    transport = httpx.MockTransport(
        lambda request: httpx.Response(
            200, json={"code": 905, "msg": "账户未进行实名认证"}
        )
    )
    ok = run(
        push_wechat_message("hi", make_pushplus_settings(), transport=transport)
    )
    assert ok is False


def test_pushplus_success_code() -> None:
    transport = httpx.MockTransport(
        lambda request: httpx.Response(200, json={"code": 200, "msg": "请求成功"})
    )
    ok = run(
        push_wechat_message("hi", make_pushplus_settings(), transport=transport)
    )
    assert ok is True


def test_scan_reminders_disabled_without_supabase() -> None:
    result = run(scan_reminders(Settings(supabase_url=None)))
    assert result["enabled"] is False


def test_scan_reminders_disabled_without_channel() -> None:
    result = run(scan_reminders(make_settings(wechat_push_type="none")))
    assert result["enabled"] is False


def test_scan_reminders_pushes_and_dedupes(monkeypatch) -> None:
    settings = make_settings()
    rows = [
        make_row(
            "u1",
            [
                {
                    "id": "b1",
                    "name": "开会",
                    "date": "2026-08-11",
                    "start": 600,
                    "end": 720,
                    "remindAt": "2020-01-01T00:00:00Z",
                },
                {
                    "id": "b2",
                    "name": "健身",
                    "date": "2026-08-11",
                    "start": 480,
                    "end": 540,
                    "remindAt": "2020-01-02T00:00:00Z",
                },
            ],
        )
    ]
    monkeypatch.setattr("app.services.reminders.fetch_schedule_rows", async_fake(rows))
    monkeypatch.setattr(
        "app.services.reminders.fetch_pushed_reminders",
        async_fake({("u1", "b1", "2020-01-01T00:00:00+00:00")}),
    )
    pushed_messages: list[str] = []

    async def fake_push(message: str, _settings: Settings) -> bool:
        pushed_messages.append(message)
        return True

    monkeypatch.setattr("app.services.reminders.push_wechat_message", fake_push)
    inserted: list[tuple[str, str]] = []

    async def fake_insert(
        _settings: Settings, user_id: str, block_id: str, remind_at: datetime
    ) -> None:
        inserted.append((user_id, block_id))

    monkeypatch.setattr("app.services.reminders.insert_reminder_log", fake_insert)

    result = run(scan_reminders(settings))
    assert result["enabled"] is True
    assert result["pushed"] == 1
    assert result["skipped"] == 1
    assert len(pushed_messages) == 1
    assert inserted == [("u1", "b2")]


def test_scan_reminders_keeps_error_on_push_failure(monkeypatch) -> None:
    settings = make_settings()
    rows = [
        make_row(
            "u1",
            [
                {
                    "id": "b1",
                    "name": "开会",
                    "date": "2026-08-11",
                    "start": 600,
                    "end": 720,
                    "remindAt": "2020-01-01T00:00:00Z",
                }
            ],
        )
    ]
    monkeypatch.setattr("app.services.reminders.fetch_schedule_rows", async_fake(rows))
    monkeypatch.setattr("app.services.reminders.fetch_pushed_reminders", async_fake(set()))
    monkeypatch.setattr("app.services.reminders.push_wechat_message", async_fake(False))
    inserted: list[tuple[str, str]] = []

    async def fake_insert(
        _settings: Settings, user_id: str, block_id: str, remind_at: datetime
    ) -> None:
        inserted.append((user_id, block_id))

    monkeypatch.setattr("app.services.reminders.insert_reminder_log", fake_insert)

    result = run(scan_reminders(settings))
    assert result["pushed"] == 0
    assert result["errors"] == ["push failed: b1"]
    assert inserted == []


def test_reminders_status_shape() -> None:
    response = client.get("/api/v1/reminders/status")
    assert response.status_code == 200
    body = response.json()
    assert {"enabled", "channel", "scan_seconds"} <= set(body)


def test_reminders_run_endpoint(monkeypatch) -> None:
    async def fake_scan(_settings: Settings) -> dict:
        return {"enabled": True, "checked": 2, "pushed": 1, "skipped": 0, "errors": []}

    monkeypatch.setattr("app.routers.reminders.scan_reminders", fake_scan)
    response = client.post("/api/v1/reminders/run")
    assert response.status_code == 200
    assert response.json()["pushed"] == 1


def _override_settings(settings: Settings) -> object | None:
    previous = app.dependency_overrides.get(get_settings)
    app.dependency_overrides[get_settings] = lambda: settings
    return previous


def _restore_settings(previous: object | None) -> None:
    if previous is None:
        app.dependency_overrides.pop(get_settings, None)
    else:
        app.dependency_overrides[get_settings] = previous


def test_reminders_cron_disabled_without_secret() -> None:
    response = client.get("/api/v1/reminders/cron")
    assert response.status_code == 403


def test_reminders_cron_rejects_wrong_secret() -> None:
    previous = _override_settings(Settings(cron_secret="correct-secret"))
    try:
        response = client.get(
            "/api/v1/reminders/cron",
            headers={"Authorization": "Bearer wrong-secret"},
        )
        assert response.status_code == 401
    finally:
        _restore_settings(previous)


def test_reminders_cron_runs_scan(monkeypatch) -> None:
    async def fake_scan(_settings: Settings) -> dict:
        return {"enabled": True, "checked": 1, "pushed": 1, "skipped": 0, "errors": []}

    monkeypatch.setattr("app.routers.reminders.scan_reminders", fake_scan)
    previous = _override_settings(Settings(cron_secret="correct-secret"))
    try:
        response = client.get(
            "/api/v1/reminders/cron",
            headers={"Authorization": "Bearer correct-secret"},
        )
        assert response.status_code == 200
        assert response.json()["pushed"] == 1
    finally:
        _restore_settings(previous)


def test_lifespan_respects_enable_scheduler(monkeypatch) -> None:
    created: list[object] = []

    class FakeScheduler:
        def __init__(self, *args, **kwargs) -> None:
            created.append(self)

        def add_job(self, *args, **kwargs) -> None:
            pass

        def start(self) -> None:
            pass

        def shutdown(self, *args, **kwargs) -> None:
            pass

    monkeypatch.setattr("app.main.AsyncIOScheduler", FakeScheduler)
    ready_settings = Settings(
        supabase_url="https://example.supabase.co",
        supabase_service_role_key="service-key",
        wechat_push_type="pushplus",
        pushplus_token="demo-token",
    )
    monkeypatch.setattr("app.main.settings", ready_settings)
    with TestClient(app):
        assert len(created) == 1

    created.clear()
    monkeypatch.setattr(
        "app.main.settings",
        ready_settings.model_copy(update={"enable_scheduler": False}),
    )
    with TestClient(app):
        assert created == []
