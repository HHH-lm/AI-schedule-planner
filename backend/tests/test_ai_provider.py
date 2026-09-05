from __future__ import annotations

import asyncio

from fastapi.testclient import TestClient

from app.config import Settings, get_settings
from app.main import app
from app.schemas import ParsedSchedule
from app.services.ai import call_chat_completions, resolve_ai_provider


def override_settings() -> Settings:
    return Settings(
        ai_provider="local",
        openai_api_key="",
        deepseek_api_key="",
    )


app.dependency_overrides[get_settings] = override_settings
client = TestClient(app)

NO_KEY_SETTINGS = Settings(ai_provider="local", openai_api_key="", deepseek_api_key="")


# ── resolve_ai_provider：用户自备 Key 决策 ────────────────────


def test_request_with_api_key_uses_requested_provider() -> None:
    provider, message = resolve_ai_provider(
        "deepseek", NO_KEY_SETTINGS, api_key="user-key"
    )
    assert provider == "deepseek"
    assert message is None


def test_ai_provider_without_api_key_falls_back_local() -> None:
    provider, message = resolve_ai_provider("deepseek", NO_KEY_SETTINGS, api_key=None)
    assert provider is None
    assert message is not None and "未填写 DeepSeek API Key" in message


def test_openai_without_api_key_falls_back_local() -> None:
    provider, message = resolve_ai_provider("openai", NO_KEY_SETTINGS, api_key=None)
    assert provider is None
    assert message is not None and "未填写 OpenAI API Key" in message


def test_local_provider_returns_local_even_with_key() -> None:
    provider, message = resolve_ai_provider(
        "local", NO_KEY_SETTINGS, api_key="user-key"
    )
    assert provider is None
    assert message is None


def test_auto_maps_to_env_provider_then_requires_key() -> None:
    settings = Settings(ai_provider="deepseek", openai_api_key="", deepseek_api_key="")
    provider, message = resolve_ai_provider("auto", settings, api_key=None)
    assert provider is None
    assert message is not None
    provider, message = resolve_ai_provider("auto", settings, api_key="user-key")
    assert provider == "deepseek"
    assert message is None


def test_legacy_auto_env_value_defaults_to_local() -> None:
    settings = Settings(ai_provider="auto", openai_api_key="", deepseek_api_key="")
    provider, _ = resolve_ai_provider("auto", settings, api_key="user-key")
    assert provider is None


def test_invalid_provider_maps_to_env_default() -> None:
    provider, _ = resolve_ai_provider("bogus", NO_KEY_SETTINGS, api_key="user-key")
    assert provider is None


def test_server_env_key_alone_does_not_serve_requests() -> None:
    settings = Settings(
        ai_provider="local", openai_api_key="", deepseek_api_key="server-secret"
    )
    provider, message = resolve_ai_provider("deepseek", settings, api_key=None)
    assert provider is None
    assert message is not None and "未填写" in message


# ── /api/v1/parse 集成：请求级 Key 透传 ───────────────────────


def test_parse_with_user_key_routes_to_ai(monkeypatch) -> None:
    calls: dict = {}

    async def fake_parse_with_ai(text, provider, today, settings, api_key=None):
        calls["provider"] = provider
        calls["api_key"] = api_key
        return (
            "deepseek",
            [ParsedSchedule(name="写代码", date="2026-08-04", start=840, end=1020)],
            None,
            None,
        )

    monkeypatch.setattr("app.routers.parse.parse_with_ai", fake_parse_with_ai)
    response = client.post(
        "/api/v1/parse",
        json={
            "text": "周二下午2点到5点写代码",
            "today": "2026-08-03",
            "provider": "deepseek",
            "api_key": "user-key",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["source"] == "deepseek"
    assert body["schedules"][0]["name"] == "写代码"
    assert calls["provider"] == "deepseek"
    assert calls["api_key"] == "user-key"


def test_parse_ai_choice_without_key_falls_back_local_with_hint(monkeypatch) -> None:
    def fail(*args, **kwargs):  # pragma: no cover - 断言不被调用
        raise AssertionError("parse_with_ai must not be called without api_key")

    monkeypatch.setattr("app.routers.parse.parse_with_ai", fail)
    response = client.post(
        "/api/v1/parse",
        json={
            "text": "周二下午2点到5点写代码",
            "today": "2026-08-03",
            "provider": "openai",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["source"] == "local"
    assert body["message"] is not None and "未填写 OpenAI API Key" in body["message"]


# ── call_chat_completions：请求级凭证优先，环境变量 Key 仅回退（评测链路） ──


class _FakeResponse:
    status_code = 200
    content = b"{}"

    def json(self) -> dict:
        return {"choices": [{"message": {"content": "{}"}}]}


def _install_fake_client(monkeypatch, captured: dict) -> None:
    class _FakeClient:
        def __init__(self, timeout=None):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return False

        async def post(self, url, headers=None, json=None):
            captured["auth"] = headers.get("Authorization")
            return _FakeResponse()

    monkeypatch.setattr("app.services.ai.httpx.AsyncClient", _FakeClient)


def test_call_chat_completions_prefers_request_credential(monkeypatch) -> None:
    captured: dict = {}
    _install_fake_client(monkeypatch, captured)
    settings = Settings(openai_api_key="", deepseek_api_key="")
    asyncio.run(
        call_chat_completions(
            "system", "user", "deepseek", settings, credential="user-key"
        )
    )
    assert captured["auth"] == "Bearer user-key"


def test_call_chat_completions_env_key_fallback_for_eval(monkeypatch) -> None:
    captured: dict = {}
    _install_fake_client(monkeypatch, captured)
    settings = Settings(openai_api_key="", deepseek_api_key="eval-secret")
    asyncio.run(call_chat_completions("system", "user", "deepseek", settings))
    assert captured["auth"] == "Bearer eval-secret"
