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


def test_breakdown_local_fallback() -> None:
    response = client.post(
        "/api/v1/breakdown",
        json={"plan": "做一期视频\n写AI应用文章", "provider": "local"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["source"] == "local"
    assert [task["name"] for task in body["tasks"]] == ["做一期视频", "写AI应用文章"]


def test_plan_local_fallback() -> None:
    response = client.post(
        "/api/v1/plan",
        json={
            "tasks": [{"name": "写代码"}, {"name": "健身"}],
            "existing_blocks": [],
            "start_date": "2026-08-03",
            "horizon_days": 7,
            "provider": "local",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["source"] == "local"
    assert len(body["blocks"]) == 2
    assert body["blocks"][0]["name"] == "写代码"
    assert body["blocks"][1]["name"] == "健身"


def test_plan_local_fallback_avoids_conflicts() -> None:
    response = client.post(
        "/api/v1/plan",
        json={
            "tasks": [{"name": "写代码"}],
            "existing_blocks": [
                {"date": "2026-08-03", "start": 9 * 60, "end": 10 * 60, "status": "scheduled"}
            ],
            "start_date": "2026-08-03",
            "horizon_days": 1,
            "provider": "local",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert len(body["blocks"]) == 1
    # 验证生成的时间块不与已有日程冲突
    block = body["blocks"][0]
    assert not (block["date"] == "2026-08-03" and block["start"] < 10 * 60 and 9 * 60 < block["end"])
