"""语音转文字：转发录音到 SiliconFlow 的 OpenAI 兼容转录接口。

与 ai.py（chat/completions）的差异，都是实测/文档确认过的坑：
  - 走 multipart 上传二进制音频，不是 JSON body
  - 响应体只有 {"text": "..."}，没有 duration / 分段 / usage
  - 401/403/404/504 返回的是裸字符串（如 "Invalid token"）而不是 JSON 对象，
    不能无脑 response.json()，否则解析异常会盖掉真实错误原因
  - 429 的响应体结构又和其他错误不同（没有 code 字段）

日志只记脱敏元数据（字节数、耗时、状态码），不记音频内容与识别文本。
"""

from __future__ import annotations

import json
import logging
import time

import httpx

from app.config import Settings
from app.logging_setup import get_logger, log_event
from app.schemas import TranscribeResponse


logger = get_logger("app.asr")

# 上游状态码 → 面向用户的中文提示前缀（细节由上游 message 补充）
_STATUS_HINTS = {
    400: "语音服务无法识别该音频",
    401: "语音服务 API Key 无效",
    403: "语音服务拒绝访问（可能需完成实名认证）",
    413: "录音文件过大",
    429: "语音识别请求过于频繁，请稍后重试",
    503: "语音服务繁忙，请稍后重试",
    504: "语音服务响应超时，请稍后重试",
}


def extract_error_detail(response: httpx.Response) -> str:
    """从错误响应中提取可读详情。

    上游错误体形态不统一：可能是 JSON 对象（含 message）、可能是裸字符串
    （含引号或不含），也可能是空。逐层退化，绝不抛异常。
    """
    text = response.text.strip()
    if not text:
        return ""
    try:
        payload = json.loads(text)
    except json.JSONDecodeError:
        return text
    if isinstance(payload, str):
        return payload.strip()
    if isinstance(payload, dict):
        message = payload.get("message")
        if isinstance(message, str) and message.strip():
            return message.strip()
        code = payload.get("code")
        if code is not None:
            return f"code={code}"
    return text


def wav_duration_seconds(audio: bytes) -> float | None:
    """读取 WAV 字节流的时长；非 WAV 或头部异常时返回 None（跳过时长校验）。

    前端固定上传 16kHz 单声道 WAV，因此这里能拿到真实时长；
    若将来改为直传压缩格式，本函数自然退化为不做校验。
    """
    if len(audio) < 44 or audio[0:4] != b"RIFF" or audio[8:12] != b"WAVE":
        return None
    offset = 12
    byte_rate: int | None = None
    data_size: int | None = None
    while offset + 8 <= len(audio):
        chunk_id = audio[offset : offset + 4]
        chunk_size = int.from_bytes(audio[offset + 4 : offset + 8], "little")
        body = offset + 8
        if chunk_id == b"fmt " and body + 16 <= len(audio):
            byte_rate = int.from_bytes(audio[body + 8 : body + 12], "little")
        elif chunk_id == b"data":
            data_size = min(chunk_size, max(0, len(audio) - body))
            break
        if chunk_size <= 0:
            break
        # 块按偶数字节对齐
        offset = body + chunk_size + (chunk_size % 2)
    if not byte_rate or data_size is None:
        return None
    return data_size / byte_rate


def safe_audio_filename(name: str | None) -> str:
    """把客户端文件名收敛成安全的单段文件名，避免路径与超长名传到上游。"""
    candidate = (name or "").replace("\\", "/").split("/")[-1].strip()
    if not candidate or len(candidate) > 64:
        return "audio.wav"
    cleaned = "".join(ch for ch in candidate if ch.isalnum() or ch in "._-")
    return cleaned or "audio.wav"


async def transcribe_audio(
    audio: bytes,
    filename: str,
    content_type: str,
    settings: Settings,
) -> TranscribeResponse:
    """调用 SiliconFlow 转录接口。

    上游失败不抛异常，返回 source="none" + 中文 message，与 /parse 的
    优雅降级一致，让前端用同一套反馈逻辑展示。
    """
    model = settings.siliconflow_asr_model
    started = time.perf_counter()
    log_event(
        logger,
        logging.INFO,
        "asr.request",
        model=model,
        bytes=len(audio),
        content_type=content_type,
        timeout_ms=settings.asr_timeout_ms,
    )

    try:
        async with httpx.AsyncClient(timeout=settings.asr_timeout_ms / 1000) as client:
            response = await client.post(
                f"{settings.siliconflow_base_url.rstrip('/')}/audio/transcriptions",
                headers={"Authorization": f"Bearer {settings.siliconflow_api_key}"},
                files={
                    "file": (filename, audio, content_type),
                    "model": (None, model),
                },
            )
    except (httpx.TimeoutException, httpx.ConnectError) as error:
        duration_ms = round((time.perf_counter() - started) * 1000, 2)
        log_event(
            logger,
            logging.ERROR,
            "asr.error",
            model=model,
            duration_ms=duration_ms,
            error=type(error).__name__,
        )
        # 超时与连接失败要分开提示（同 F-039 的 AI 链路修正）：上游免费模型
        # 实测延迟波动大（同音频 0.2~30+ 秒），超时的常见原因是服务排队而非本机断网，
        # 混成「检查网络」会把用户引向错误方向。
        if isinstance(error, httpx.TimeoutException):
            return TranscribeResponse(
                source="none",
                message="语音识别超时，可能是识别服务繁忙，请稍后重试或缩短录音",
            )
        return TranscribeResponse(
            source="none",
            message="无法连接语音识别服务，请检查网络后重试",
        )

    duration_ms = round((time.perf_counter() - started) * 1000, 2)

    if response.status_code >= 400:
        detail = extract_error_detail(response)
        suffix = f"：{detail}" if detail else ""
        log_event(
            logger,
            logging.ERROR,
            "asr.error",
            model=model,
            duration_ms=duration_ms,
            status=response.status_code,
            error=detail[:120] or "HTTP error",
        )
        hint = _STATUS_HINTS.get(response.status_code, "语音识别失败")
        return TranscribeResponse(source="none", message=f"{hint}{suffix}")

    try:
        payload = response.json()
    except json.JSONDecodeError:
        payload = None
    text = payload.get("text") if isinstance(payload, dict) else None
    if not isinstance(text, str):
        log_event(
            logger,
            logging.ERROR,
            "asr.error",
            model=model,
            duration_ms=duration_ms,
            status=response.status_code,
            error="missing_text_field",
        )
        return TranscribeResponse(source="none", message="语音识别未返回结果，请重试")

    log_event(
        logger,
        logging.INFO,
        "asr.response",
        model=model,
        duration_ms=duration_ms,
        status=response.status_code,
        text_chars=len(text),
    )
    return TranscribeResponse(source="siliconflow", text=text)
