from __future__ import annotations

import pytest

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


def test_plan_v2_accepts_custom_weights() -> None:
    """plan-v2 应接受个性化规划七维权重并正常返回。"""
    response = client.post(
        "/api/v1/plan-v2",
        json={
            "tasks": [{"title": "写代码", "duration": 60}],
            "planning_range": {"start": "2026-08-03", "end": "2026-08-03"},
            "provider": "local",
            "weights": {
                "memory": 0.5,
                "understanding": 0.2,
                "time": 0.1,
                "priority": 0.1,
                "deadline": 0.05,
                "conflict": 0.05,
                "workload": 0.0,
            },
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["source"] == "local"
    assert len(body["blocks"]) == 1


def test_plan_v2_rejects_weights_out_of_range() -> None:
    """权重超出 0-1 范围应返回 422。"""
    response = client.post(
        "/api/v1/plan-v2",
        json={
            "tasks": [{"title": "写代码", "duration": 60}],
            "planning_range": {"start": "2026-08-03", "end": "2026-08-03"},
            "provider": "local",
            "weights": {"memory": 1.5},
        },
    )
    assert response.status_code == 422


def test_plan_v2_accepts_deadline_window_and_defers_far_tasks() -> None:
    """API 层应接受 DDL 窗口并在响应中返回 deferred 列表。"""
    response = client.post(
        "/api/v1/plan-v2",
        json={
            "tasks": [
                {"title": "远期任务", "duration": 60, "deadline": "2026-09-10"},
                {"title": "近期任务", "duration": 60, "deadline": "2026-08-03"},
            ],
            "planning_range": {"start": "2026-08-03", "end": "2026-08-03"},
            "provider": "local",
            "deadline_window_days": 3,
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["source"] == "local"
    assert body["deferred"] == ["远期任务"]
    assert [block["title"] for block in body["blocks"]] == ["近期任务"]


def test_plan_v2_rejects_deadline_window_out_of_range() -> None:
    """DDL 窗口超出 1-365 范围应返回 422。"""
    response = client.post(
        "/api/v1/plan-v2",
        json={
            "tasks": [{"title": "写代码", "duration": 60}],
            "planning_range": {"start": "2026-08-03", "end": "2026-08-03"},
            "provider": "local",
            "deadline_window_days": 366,
        },
    )
    assert response.status_code == 422


@pytest.mark.parametrize("window_days", [1, 365, None, 1.0, "3"])
def test_plan_v2_accepts_valid_deadline_window_values(window_days) -> None:
    """可空非严格整数：接受边界、null，以及可转换的整数值。"""
    payload = {
        "tasks": [{"title": "写代码", "duration": 60}],
        "planning_range": {"start": "2026-08-03", "end": "2026-08-03"},
        "provider": "local",
        "deadline_window_days": window_days,
    }
    response = client.post("/api/v1/plan-v2", json=payload)
    assert response.status_code == 200
    body = response.json()
    assert body["deferred"] == []
    assert body["unassigned"] == []
    assert [block["title"] for block in body["blocks"]] == ["写代码"]


@pytest.mark.parametrize(
    "window_days", [0, 366, -1, 1.5, "three"]
)
def test_plan_v2_rejects_invalid_deadline_window_values(window_days) -> None:
    """非法窗口值：0/366/负数/小数/非数字均应返回 422。"""
    response = client.post(
        "/api/v1/plan-v2",
        json={
            "tasks": [{"title": "写代码", "duration": 60}],
            "planning_range": {"start": "2026-08-03", "end": "2026-08-03"},
            "provider": "local",
            "deadline_window_days": window_days,
        },
    )
    assert response.status_code == 422


def test_analyze_memories_no_data_returns_message() -> None:
    """无任何时间块数据时，应返回提示让用户知道无法分析。"""
    response = client.post(
        "/api/v1/memories/analyze",
        json={"timeBlocks": [], "horizon_days": 14, "today": "2026-08-10"},
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
        json={"timeBlocks": blocks, "horizon_days": 14, "today": "2026-08-10"},
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
        json={"timeBlocks": blocks, "horizon_days": 14, "today": "2026-08-10"},
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
        json={"timeBlocks": blocks, "horizon_days": 14, "today": "2026-08-10"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["suggestions"], "应有建议生成"
    assert body["message"] is None


def test_parse_local_done_directive() -> None:
    """本地规则链路：完成指令产出 done=true 且指令子句剥离出 name。"""
    response = client.post(
        "/api/v1/parse",
        json={"text": "明天下午3点到4点开会，标记为已完成", "today": "2026-08-03"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["source"] == "local"
    schedule = body["schedules"][0]
    assert schedule["name"] == "开会"
    assert schedule["date"] == "2026-08-04"
    assert schedule["done"] is True
    assert "标记" not in schedule["name"]


def test_parse_local_without_directive_done_false() -> None:
    response = client.post(
        "/api/v1/parse",
        json={"text": "明天下午3点到4点开会", "today": "2026-08-03"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["schedules"][0]["done"] is False


def test_conflicts_check_preserves_done_field() -> None:
    """冲突检查复用 ParsedSchedule：done 字段请求→响应原样透传。"""
    response = client.post(
        "/api/v1/conflicts/check",
        json={
            "schedules": [
                {"name": "写代码", "date": "2026-08-04", "start": 840, "end": 1020, "done": True}
            ],
            "existing_blocks": [],
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["accepted"][0]["done"] is True


# ── 日志环境标记（Axiom 监控按 env 过滤生产日志）────────────────


def test_log_env_prefers_explicit_app_env() -> None:
    assert Settings(app_env="prod").log_env == "prod"
    assert Settings(app_env="dev", vercel_env="production").log_env == "dev"


def test_log_env_normalizes_aliases() -> None:
    """APP_ENV=production 必须归一化为 prod，否则监控按 prod 过滤会匹配不上。"""
    assert Settings(app_env="production").log_env == "prod"
    assert Settings(app_env="PRODUCTION").log_env == "prod"
    assert Settings(app_env=" prod ").log_env == "prod"
    assert Settings(app_env="development").log_env == "dev"
    # 未识别的值按原值输出（保留 staging 等多环境扩展余地）
    assert Settings(app_env="staging").log_env == "staging"


def test_log_env_infers_from_vercel_env() -> None:
    assert Settings(vercel_env="production").log_env == "prod"
    assert Settings(vercel_env="preview").log_env == "preview"
    assert Settings(vercel_env="development").log_env == "dev"
    assert Settings(vercel_env="PRODUCTION").log_env == "prod"


def test_log_env_defaults_to_dev() -> None:
    # 未配置任何环境变量时必须是 dev：若误判为 prod，本地噪音会被当成生产告警
    assert Settings(vercel_env=None).log_env == "dev"
