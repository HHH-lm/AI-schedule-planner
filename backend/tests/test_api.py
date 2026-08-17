from __future__ import annotations

from fastapi.testclient import TestClient

from app.config import Settings, get_settings
from app.main import app


def override_settings() -> Settings:
    return Settings(
        ai_provider="local",
        openai_api_key="",
        deepseek_api_key="",
    )


app.dependency_overrides[get_settings] = override_settings
client = TestClient(app)


def test_health() -> None:
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_parse_local() -> None:
    response = client.post(
        "/api/v1/parse",
        json={"text": "周二下午2点到5点写代码", "today": "2026-08-03"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["source"] == "local"
    assert body["schedules"][0]["name"] == "写代码"
    assert body["schedules"][0]["date"] == "2026-08-04"


def test_parse_local_cross_day() -> None:
    response = client.post(
        "/api/v1/parse",
        json={
            "text": "今晚10点到明天早上8点值班",
            "today": "2026-08-03",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["source"] == "local"
    schedule = body["schedules"][0]
    assert schedule["date"] == "2026-08-03"
    assert schedule["start"] == 22 * 60
    assert schedule["end"] == 1440 + 8 * 60


def test_parse_empty_input() -> None:
    response = client.post("/api/v1/parse", json={"text": "   "})
    assert response.status_code == 200
    assert response.json()["rejected"]["code"] == "empty"


def test_conflicts_check() -> None:
    response = client.post(
        "/api/v1/conflicts/check",
        json={
            "schedules": [
                {"name": "写代码", "date": "2026-08-04", "start": 840, "end": 1020}
            ],
            "existing_blocks": [
                {"date": "2026-08-04", "start": 900, "end": 960, "status": "scheduled"}
            ],
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["accepted"] == []
    assert body["blocked"][0]["name"] == "写代码"


def test_conflicts_check_cross_day() -> None:
    response = client.post(
        "/api/v1/conflicts/check",
        json={
            "schedules": [
                {
                    "name": "跨天值班",
                    "date": "2026-08-03",
                    "start": 22 * 60,
                    "end": 1440 + 8 * 60,
                }
            ],
            "existing_blocks": [
                {
                    "date": "2026-08-04",
                    "start": 7 * 60,
                    "end": 9 * 60,
                    "status": "scheduled",
                }
            ],
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["accepted"] == []
    assert body["blocked"][0]["name"] == "跨天值班"


def test_breakdown_local_fallback() -> None:
    response = client.post(
        "/api/v1/breakdown",
        json={"plan": "做一期视频\n写AI应用文章", "provider": "local"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["source"] == "local"
    assert [task["name"] for task in body["tasks"]] == ["做一期视频", "写AI应用文章"]
