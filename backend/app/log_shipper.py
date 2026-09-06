"""Axiom 日志直发：把结构化 JSON Lines 缓冲并批量上报。

Hobby 版 Vercel 无 Log Drain（Pro 专属功能），由应用内直发替代：
  - install_shipper() 在配置了 AXIOM_API_TOKEN + AXIOM_DATASET 时向根 logger
    挂载缓冲 handler（未配置则零开销，本地开发默认不发送）；
  - flush_logs() 在请求尾/提醒扫描尾同步 POST NDJSON 到 Axiom ingest，
    必须在响应结束前完成，规避 Serverless 冻结；
  - 任何失败（网络异常/非 2xx）静默丢弃并计数，绝不影响业务请求。

约定与 logging_setup 一致：只发送脱敏元数据，不含用户原始内容与密钥。
"""

from __future__ import annotations

import logging
import threading

import httpx

from app.config import Settings, get_settings
from app.logging_setup import JsonFormatter

# 缓冲上限：超过后丢最旧日志，防止极端情况下内存无界增长
MAX_BUFFER_LINES = 500

_stats_lock = threading.Lock()
_stats: dict[str, int] = {"dropped_lines": 0, "failed_flushes": 0, "sent_lines": 0}

_handler: ShipperHandler | None = None


class ShipperHandler(logging.Handler):
    """缓冲已格式化的 JSON 行（含 emit 时的 request_id 上下文），flush 时取走。"""

    def __init__(self, max_lines: int = MAX_BUFFER_LINES) -> None:
        super().__init__(level=logging.INFO)
        self.setFormatter(JsonFormatter())
        self._max_lines = max_lines
        self._lines: list[str] = []

    def emit(self, record: logging.LogRecord) -> None:
        try:
            line = self.format(record)
        except Exception:  # noqa: BLE001 - 格式化失败绝不影响业务
            return
        with self.lock:
            self._lines.append(line)
            if len(self._lines) > self._max_lines:
                dropped = len(self._lines) - self._max_lines
                del self._lines[:dropped]
                _bump("dropped_lines", dropped)

    def take_lines(self) -> list[str]:
        with self.lock:
            lines = self._lines
            self._lines = []
            return lines


def _bump(key: str, amount: int = 1) -> None:
    with _stats_lock:
        _stats[key] += amount


def shipper_stats() -> dict[str, int]:
    """直发统计（丢弃行数/失败次数/成功行数），诊断用。"""
    with _stats_lock:
        return dict(_stats)


def shipper_active(settings: Settings) -> bool:
    return bool(
        settings.log_ship_enabled
        and settings.axiom_api_token
        and settings.axiom_dataset
    )


def install_shipper(settings: Settings) -> ShipperHandler | None:
    """配置齐全时向根 logger 挂载直发 handler（幂等）；未配置返回 None。"""
    global _handler
    if not shipper_active(settings):
        return None
    if _handler is not None:
        return _handler
    handler = ShipperHandler()
    logging.getLogger().addHandler(handler)
    _handler = handler
    return handler


def flush_logs() -> None:
    """把缓冲日志同步发送到 Axiom（未配置或失败时静默返回）。"""
    settings = get_settings()
    if not shipper_active(settings) or _handler is None:
        return
    lines = _handler.take_lines()
    if not lines:
        return
    payload = "\n".join(lines)
    url = f"{settings.axiom_api_url.rstrip('/')}/v1/ingest/{settings.axiom_dataset}"
    try:
        response = httpx.post(
            url,
            params={"timestamp-field": "time"},
            headers={
                "Authorization": f"Bearer {settings.axiom_api_token}",
                "Content-Type": "application/x-ndjson",
            },
            content=payload.encode("utf-8"),
            timeout=settings.log_ship_timeout_seconds,
        )
    except Exception:  # noqa: BLE001 - 发送失败绝不影响业务
        _bump("failed_flushes")
        _bump("dropped_lines", len(lines))
        return
    if response.status_code >= 400:
        _bump("failed_flushes")
        _bump("dropped_lines", len(lines))
        return
    _bump("sent_lines", len(lines))
