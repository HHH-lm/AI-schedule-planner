from __future__ import annotations

import asyncio

import httpx

from fastapi.testclient import TestClient

from app.config import Settings, get_settings
from app.main import app
from app.schemas import ParsedSchedule
from app.services.ai import call_chat_completions, parse_with_ai, resolve_ai_provider


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
            captured["body"] = json
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


# ── parse_with_ai：连接失败与超时提示拆分 ─────────────────────


def test_parse_with_ai_connect_error_reports_connection_message(monkeypatch) -> None:
    async def fake_chat(*args, **kwargs):
        raise httpx.ConnectError("proxy down")

    monkeypatch.setattr("app.services.ai.call_chat_completions", fake_chat)
    source, schedules, rejected, message = asyncio.run(
        parse_with_ai(
            "9月13日晚上8点半开会",
            "deepseek",
            "2026-09-13",
            Settings(deepseek_api_key="test-key"),
        )
    )
    assert source == "none"
    assert schedules == []
    assert rejected is None
    assert message == "无法连接 AI 服务，请检查网络/代理"


def test_parse_with_ai_timeout_keeps_timeout_message(monkeypatch) -> None:
    async def fake_chat(*args, **kwargs):
        raise httpx.ReadTimeout("slow")

    monkeypatch.setattr("app.services.ai.call_chat_completions", fake_chat)
    _, _, _, message = asyncio.run(
        parse_with_ai(
            "9月13日晚上8点半开会",
            "deepseek",
            "2026-09-13",
            Settings(deepseek_api_key="test-key"),
        )
    )
    assert message is not None
    assert message.startswith("AI 解析超时")


# ── thinking 模式截断：思考耗尽 max_tokens 时正文为空 ──────────


def test_parse_with_ai_truncated_output_reports_truncation(monkeypatch) -> None:
    async def fake_chat(*args, **kwargs):
        return {
            "choices": [
                {
                    "finish_reason": "length",
                    "message": {"content": "", "reasoning_content": "很长的思考"},
                }
            ]
        }

    monkeypatch.setattr("app.services.ai.call_chat_completions", fake_chat)
    _, _, _, message = asyncio.run(
        parse_with_ai(
            "晚上8:30~9:10任务测试",
            "deepseek",
            "2026-09-14",
            Settings(deepseek_api_key="test-key"),
        )
    )
    assert message == "AI 解析失败：AI 输出被截断（思考耗尽输出预算），请重试"


def test_parse_with_ai_empty_choices_keeps_empty_result_message(monkeypatch) -> None:
    async def fake_chat(*args, **kwargs):
        return {"choices": []}

    monkeypatch.setattr("app.services.ai.call_chat_completions", fake_chat)
    _, _, _, message = asyncio.run(
        parse_with_ai(
            "晚上8:30~9:10任务测试",
            "deepseek",
            "2026-09-14",
            Settings(deepseek_api_key="test-key"),
        )
    )
    assert message == "AI 解析失败：AI 服务返回空结果"


# ── DeepSeek thinking 开关：请求体注入与 provider 隔离 ────────


def test_deepseek_request_disables_thinking_by_default(monkeypatch) -> None:
    captured: dict = {}
    _install_fake_client(monkeypatch, captured)
    asyncio.run(
        call_chat_completions("sys", "user", "deepseek", Settings(deepseek_api_key="k"))
    )
    assert captured["body"]["thinking"] == {"type": "disabled"}


def test_deepseek_thinking_enabled_passthrough(monkeypatch) -> None:
    captured: dict = {}
    _install_fake_client(monkeypatch, captured)
    settings = Settings(deepseek_api_key="k", deepseek_thinking="enabled")
    asyncio.run(call_chat_completions("sys", "user", "deepseek", settings))
    assert captured["body"]["thinking"] == {"type": "enabled"}


def test_deepseek_thinking_invalid_value_omits_param(monkeypatch) -> None:
    captured: dict = {}
    _install_fake_client(monkeypatch, captured)
    settings = Settings(deepseek_api_key="k", deepseek_thinking="whatever")
    asyncio.run(call_chat_completions("sys", "user", "deepseek", settings))
    assert "thinking" not in captured["body"]


def test_openai_request_has_no_thinking_param(monkeypatch) -> None:
    captured: dict = {}
    _install_fake_client(monkeypatch, captured)
    asyncio.run(
        call_chat_completions("sys", "user", "openai", Settings(openai_api_key="k"))
    )
    assert "thinking" not in captured["body"]
