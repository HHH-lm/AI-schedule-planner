"""后端结构化日志与关键事件埋点。

输出约定：默认 JSON Lines，一行一个事件对象：

    {"time": "...", "level": "INFO", "logger": "app.ai",
     "event": "ai.response", "request_id": "...", "provider": "deepseek", ...}

约定：
  - 只记录脱敏元数据（长度、数量、状态码、耗时、错误类型/截断信息），
    不记录用户原始内容（自然语言输入、日程文本等）与密钥/令牌。
  - 关键事件通过 log_event() 埋点；HTTP 请求由 main.py 中间件统一记录。
  - request_id 通过 ContextVar 贯穿单个请求，用于关联 AI/推送等子事件。
"""

from __future__ import annotations

import contextvars
import json
import logging
import sys
from datetime import datetime, timezone
from typing import Any

_request_id: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "request_id", default=None
)


def set_request_id(value: str | None) -> contextvars.Token[str | None]:
    """设置当前上下文 request_id，返回用于 reset 的 Token。"""
    return _request_id.set(value)


def reset_request_id(token: contextvars.Token[str | None]) -> None:
    _request_id.reset(token)


def get_request_id() -> str | None:
    return _request_id.get()


class JsonFormatter(logging.Formatter):
    """一行一个 JSON 对象，包含 time/level/logger/event 与事件字段。"""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "time": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "event": getattr(record, "event", None) or record.getMessage(),
        }
        request_id = get_request_id()
        if request_id:
            payload["request_id"] = request_id
        fields = getattr(record, "fields", None)
        if isinstance(fields, dict):
            for key, value in fields.items():
                if key not in payload:
                    payload[key] = value
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False, default=str)


_LEVELS = {
    "DEBUG": logging.DEBUG,
    "INFO": logging.INFO,
    "WARNING": logging.WARNING,
    "ERROR": logging.ERROR,
    "CRITICAL": logging.CRITICAL,
}


def _parse_level(value: str) -> int:
    return _LEVELS.get(str(value).upper(), logging.INFO)


def setup_logging(level: str = "INFO", fmt: str = "json") -> None:
    """配置根 logger（幂等）：默认 JSON Lines 输出到 stderr，fmt 支持 json/text。"""
    root = logging.getLogger()
    root.setLevel(_parse_level(level))
    if fmt == "text":
        formatter = logging.Formatter(
            "%(asctime)s %(levelname)s %(name)s %(message)s"
        )
    else:
        formatter = JsonFormatter()
    for handler in root.handlers:
        if getattr(handler, "_ai_schedule_structured", False):
            handler.setFormatter(formatter)
            return
    handler = logging.StreamHandler(sys.stderr)
    handler._ai_schedule_structured = True  # type: ignore[attr-defined]
    handler.setFormatter(formatter)
    root.addHandler(handler)


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)


def log_event(
    logger: logging.Logger,
    level: int,
    event: str,
    **fields: Any,
) -> None:
    """关键事件埋点：记录带 event 与附加字段的结构化日志。"""
    logger.log(level, event, extra={"event": event, "fields": fields})
