"""Axiom 日志直发测试：缓冲、NDJSON 上报格式与失败静默。"""

from __future__ import annotations

import json
import logging

import httpx
import pytest

import app.log_shipper as log_shipper
from app.config import Settings
from app.logging_setup import get_logger, log_event
from app.log_shipper import ShipperHandler, flush_logs, install_shipper, shipper_active


def _ship_settings(**overrides) -> Settings:
    defaults = {
        "axiom_api_token": "xat-test-token",
        "axiom_dataset": "test-dataset",
        # conftest.py 把 LOG_SHIP_ENABLED 环境变量设为 false 以隔离本机直发，
        # 本文件要验证直发逻辑，需显式开启（环境变量不覆盖显式传入的字段值）
        "log_ship_enabled": True,
    }
    defaults.update(overrides)
    return Settings(**defaults)


@pytest.fixture(autouse=True)
def _reset_shipper():
    yield
    if log_shipper._handler is not None:
        logging.getLogger().removeHandler(log_shipper._handler)
        log_shipper._handler = None
    with log_shipper._stats_lock:
        log_shipper._stats.update(
            {"dropped_lines": 0, "failed_flushes": 0, "sent_lines": 0}
        )


def _emit_to(handler: ShipperHandler, event: str, **fields) -> None:
    logger = get_logger("app.shipper-test")
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)
    try:
        log_event(logger, logging.INFO, event, **fields)
    finally:
        logger.removeHandler(handler)


# ── 启用条件与安装 ─────────────────────────────────────────


def test_shipper_requires_token_and_dataset() -> None:
    # 显式传空值：Settings 会读取 .env.local，本地真实凭据不应影响该用例
    assert not shipper_active(Settings(axiom_api_token=None, axiom_dataset=None))
    assert not shipper_active(_ship_settings(axiom_api_token=None))
    assert not shipper_active(_ship_settings(axiom_dataset=None))
    assert shipper_active(_ship_settings())
    # 紧急停发开关
    assert not shipper_active(_ship_settings(log_ship_enabled=False))


def test_install_shipper_skipped_without_config() -> None:
    assert install_shipper(Settings(axiom_api_token=None, axiom_dataset=None)) is None
    assert log_shipper._handler is None


def test_install_shipper_idempotent() -> None:
    first = install_shipper(_ship_settings())
    assert first is not None
    second = install_shipper(_ship_settings())
    assert second is first
    # 根 logger 只挂载一个直发 handler
    assert logging.getLogger().handlers.count(first) == 1


# ── 缓冲行为 ───────────────────────────────────────────────


def test_handler_buffers_formatted_json_lines() -> None:
    handler = ShipperHandler()
    _emit_to(handler, "ai.response", status=200, duration_ms=12.5)
    lines = handler.take_lines()
    assert len(lines) == 1
    payload = json.loads(lines[0])
    assert payload["event"] == "ai.response"
    assert payload["status"] == 200
    assert payload["duration_ms"] == 12.5
    assert "time" in payload
    # 取走后缓冲清空
    assert handler.take_lines() == []


def test_handler_buffer_cap_drops_oldest() -> None:
    handler = ShipperHandler(max_lines=3)
    for index in range(5):
        _emit_to(handler, "test.event", seq=index)
    lines = [json.loads(line) for line in handler.take_lines()]
    assert len(lines) == 3
    assert [line["seq"] for line in lines] == [2, 3, 4]
    assert log_shipper.shipper_stats()["dropped_lines"] == 2


# ── flush_logs ─────────────────────────────────────────────


def test_flush_sends_ndjson_with_bearer(monkeypatch) -> None:
    settings = _ship_settings()
    monkeypatch.setattr(log_shipper, "get_settings", lambda: settings)
    handler = ShipperHandler()
    monkeypatch.setattr(log_shipper, "_handler", handler)
    _emit_to(handler, "ai.response", status=200)

    captured: dict = {}

    def fake_post(url, **kwargs):
        captured["url"] = url
        captured.update(kwargs)
        return httpx.Response(200, json={"ingested": 1})

    monkeypatch.setattr(log_shipper.httpx, "post", fake_post)

    flush_logs()
    assert (
        captured["url"]
        == "https://us-east-1.aws.edge.axiom.co/v1/ingest/test-dataset"
    )
    assert captured["headers"]["Authorization"] == "Bearer xat-test-token"
    assert captured["headers"]["Content-Type"] == "application/x-ndjson"
    lines = captured["content"].decode("utf-8").splitlines()
    assert len(lines) == 1
    assert json.loads(lines[0])["event"] == "ai.response"
    assert log_shipper.shipper_stats()["sent_lines"] == 1
    # 发送后缓冲清空，重复 flush 不再发送
    flush_logs()
    assert log_shipper.shipper_stats()["sent_lines"] == 1


def test_flush_swallows_network_error(monkeypatch) -> None:
    settings = _ship_settings()
    monkeypatch.setattr(log_shipper, "get_settings", lambda: settings)
    handler = ShipperHandler()
    monkeypatch.setattr(log_shipper, "_handler", handler)
    _emit_to(handler, "reminder.scan.error", error="boom")

    def boom_post(url, **kwargs):
        raise httpx.ConnectError("axiom unreachable")

    monkeypatch.setattr(log_shipper.httpx, "post", boom_post)

    # 网络失败绝不抛出，缓冲被丢弃并计数
    flush_logs()
    stats = log_shipper.shipper_stats()
    assert stats["failed_flushes"] == 1
    assert stats["dropped_lines"] == 1
    assert handler.take_lines() == []


def test_flush_swallows_non_2xx(monkeypatch) -> None:
    settings = _ship_settings()
    monkeypatch.setattr(log_shipper, "get_settings", lambda: settings)
    handler = ShipperHandler()
    monkeypatch.setattr(log_shipper, "_handler", handler)
    _emit_to(handler, "push.failure", reason="http_error")

    def rejected_post(url, **kwargs):
        return httpx.Response(401, json={"message": "bad token"})

    monkeypatch.setattr(log_shipper.httpx, "post", rejected_post)

    flush_logs()
    stats = log_shipper.shipper_stats()
    assert stats["failed_flushes"] == 1
    assert stats["sent_lines"] == 0


def test_flush_noop_without_config_or_handler(monkeypatch) -> None:
    def unexpected_post(url, **kwargs):  # pragma: no cover - 不应被调用
        raise AssertionError("未配置时不应发送")

    monkeypatch.setattr(log_shipper.httpx, "post", unexpected_post)

    # 未配置凭据：不发送
    monkeypatch.setattr(
        log_shipper,
        "get_settings",
        lambda: Settings(),
    )
    flush_logs()

    # 已配置但 handler 未安装：不发送
    monkeypatch.setattr(
        log_shipper,
        "get_settings",
        lambda: _ship_settings(),
    )
    assert log_shipper._handler is None
    flush_logs()
