"""路由级 per-IP 限流回归测试。

锁定各路由的 @limiter.limit 额度：前 N 次请求正常，第 N+1 次返回 429。
连打均低于全局共享桶 60/min，确保 429 归属路由级 per-IP 限额。
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.config import Settings, get_settings
from app.limiter import limiter as route_limiter
from app.main import app


def override_settings() -> Settings:
    return Settings(
        ai_provider="local",
        openai_api_key="",
        deepseek_api_key="",
    )


app.dependency_overrides[get_settings] = override_settings
client = TestClient(app)


@pytest.fixture(autouse=True)
def _reset_limiters():
    """同一 pytest 进程内所有测试共享限流计数，前后清空避免互相污染。"""
    route_limiter.reset()
    app.state.limiter.reset()
    yield
    route_limiter.reset()
    app.state.limiter.reset()


@pytest.mark.parametrize(
    ("path", "payload", "limit"),
    [
        ("/api/v1/parse", {"text": "周二下午2点到5点写代码", "today": "2026-08-03"}, 20),
        ("/api/v1/memories/analyze", {"timeBlocks": [], "today": "2026-08-21"}, 10),
        ("/api/v1/memories/context", {"memories": []}, 30),
        ("/api/v1/breakdown", {"plan": "写周报", "today": "2026-08-16"}, 10),
    ],
)
def test_route_rate_limit_returns_429_after_quota(
    path: str, payload: dict, limit: int
) -> None:
    for _ in range(limit):
        response = client.post(path, json=payload)
        assert response.status_code == 200, response.text

    response = client.post(path, json=payload)
    assert response.status_code == 429
    assert response.json()["error"].startswith("Rate limit exceeded")


def test_rate_limit_window_resets_after_reset() -> None:
    """清空限流器后同一路由可再次正常请求（验证 reset 确实作用于 per-IP 桶）。"""
    payload = {"timeBlocks": [], "today": "2026-08-21"}
    for _ in range(10):
        assert client.post("/api/v1/memories/analyze", json=payload).status_code == 200
    assert client.post("/api/v1/memories/analyze", json=payload).status_code == 429

    route_limiter.reset()
    app.state.limiter.reset()
    response = client.post("/api/v1/memories/analyze", json=payload)
    assert response.status_code == 200
