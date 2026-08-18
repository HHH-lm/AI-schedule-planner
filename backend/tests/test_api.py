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


def test_analyze_memories_no_data_returns_message() -> None:
    """无任何时间块数据时，应返回提示让用户知道无法分析。"""
    response = client.post(
        "/api/v1/memories/analyze",
        json={"timeBlocks": [], "horizon_days": 28},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["suggestions"] == []
    assert body["stats"]["total_blocks"] == 0
    assert body["message"] and "还没有时间块数据" in body["message"]


def test_analyze_memories_insufficient_data_returns_message() -> None:
    """样本量不足（<5）时，应说明当前数量与最低要求。"""
    blocks = [
        {
            "id": str(i),
            "name": "写代码",
            "date": "2026-08-03",
            "start": 540,
            "end": 600,
            "category": "work",
            "done": True,
        }
        for i in range(4)
    ]
    response = client.post(
        "/api/v1/memories/analyze",
        json={"timeBlocks": blocks, "horizon_days": 28},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["suggestions"] == []
    assert body["message"] and "数据不足" in body["message"]
    assert "4" in body["message"]


def test_analyze_memories_no_pattern_returns_message() -> None:
    """样本足够但未发现规律时，应说明已分析但无建议。"""
    blocks = [
        {
            "id": str(i),
            "name": "散步",
            "date": "2026-08-03",
            "start": 9 * 60,
            "end": 10 * 60,
            "category": "life",
            "done": True,
        }
        for i in range(12)
    ]
    response = client.post(
        "/api/v1/memories/analyze",
        json={"timeBlocks": blocks, "horizon_days": 28},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["suggestions"] == []
    assert body["message"] and "未发现明显规律" in body["message"]


def test_analyze_memories_with_pattern_has_no_message() -> None:
    """正常生成建议时不需要提示文案。"""
    blocks = [
        {
            "id": f"am{i}",
            "name": "写代码",
            "date": "2026-08-03",
            "start": 9 * 60,
            "end": 10 * 60,
            "category": "work",
            "done": True,
        }
        for i in range(10)
    ] + [
        {
            "id": f"pm{i}",
            "name": "写代码",
            "date": "2026-08-03",
            "start": 20 * 60,
            "end": 21 * 60,
            "category": "work",
            "done": False,
        }
        for i in range(10)
    ]
    response = client.post(
        "/api/v1/memories/analyze",
        json={"timeBlocks": blocks, "horizon_days": 28},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["suggestions"], "应有建议生成"
    assert body["message"] is None
