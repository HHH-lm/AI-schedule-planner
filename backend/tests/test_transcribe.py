"""语音转文字端点与 SiliconFlow 转发逻辑回归测试。

外部 HTTP 全部 mock（monkeypatch app.services.asr.httpx.AsyncClient），
覆盖上游各类响应形态——尤其是「裸字符串错误体」这类真实存在的坑。
"""

from __future__ import annotations

import json
import types

import httpx
import pytest
from fastapi.testclient import TestClient

from app.config import Settings, get_settings
from app.limiter import limiter as route_limiter
from app.main import app
from app.services.asr import (
    extract_error_detail,
    safe_audio_filename,
    wav_duration_seconds,
)


def make_wav(seconds: float, sample_rate: int = 16000) -> bytes:
    """构造真实 WAV 字节流（44 字节头 + 静音 PCM），供时长校验用例使用。"""
    frames = int(seconds * sample_rate)
    data_bytes = frames * 2
    header = bytearray(44)
    header[0:4] = b"RIFF"
    header[4:8] = (36 + data_bytes).to_bytes(4, "little")
    header[8:12] = b"WAVE"
    header[12:16] = b"fmt "
    header[16:20] = (16).to_bytes(4, "little")
    header[20:22] = (1).to_bytes(2, "little")
    header[22:24] = (1).to_bytes(2, "little")
    header[24:28] = sample_rate.to_bytes(4, "little")
    header[28:32] = (sample_rate * 2).to_bytes(4, "little")
    header[32:34] = (2).to_bytes(2, "little")
    header[34:36] = (16).to_bytes(2, "little")
    header[36:40] = b"data"
    header[40:44] = data_bytes.to_bytes(4, "little")
    return bytes(header) + b"\x00" * data_bytes


def settings_with_key(**overrides) -> Settings:
    base = {
        "ai_provider": "local",
        "openai_api_key": "",
        "deepseek_api_key": "",
        "siliconflow_api_key": "test-key",
    }
    base.update(overrides)
    return Settings(**base)


def override_settings() -> Settings:
    """依赖覆盖必须是零参可调用：FastAPI 会解析其签名，
    带 **kwargs 的函数会被当成必填 query 参数，导致请求先返回 422。"""
    return settings_with_key()


app.dependency_overrides[get_settings] = override_settings
client = TestClient(app)


@pytest.fixture(autouse=True)
def _reset_limiters():
    route_limiter.reset()
    app.state.limiter.reset()
    yield
    route_limiter.reset()
    app.state.limiter.reset()


class _FakeResponse:
    def __init__(self, status_code: int, text: str) -> None:
        self.status_code = status_code
        self.text = text

    def json(self):
        return json.loads(self.text)


class _FakeAsyncClient:
    """替换 httpx.AsyncClient：记录请求并返回预置响应。"""

    response: _FakeResponse | Exception = _FakeResponse(200, '{"text":"ok"}')
    captured: dict = {}

    def __init__(self, **kwargs) -> None:
        type(self).captured["timeout"] = kwargs.get("timeout")

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args) -> None:
        return None

    async def post(self, url, headers=None, files=None):
        type(self).captured["url"] = url
        type(self).captured["headers"] = headers
        type(self).captured["files"] = files
        if isinstance(type(self).response, Exception):
            raise type(self).response
        return type(self).response


@pytest.fixture
def fake_client(monkeypatch):
    """只替换 asr 模块内的 httpx 引用，不动全局 httpx。

    直接 patch httpx.AsyncClient 会连带影响 TestClient 自身构造 multipart 请求，
    导致请求体损坏、在进入被测代码前就返回 422。
    """
    _FakeAsyncClient.captured = {}
    _FakeAsyncClient.response = _FakeResponse(200, '{"text":"ok"}')
    stub = types.SimpleNamespace(
        AsyncClient=_FakeAsyncClient,
        ConnectError=httpx.ConnectError,
        TimeoutException=httpx.TimeoutException,
    )
    monkeypatch.setattr("app.services.asr.httpx", stub)
    return _FakeAsyncClient


def post_audio(content: bytes = b"RIFFfake", filename: str = "voice.wav", mime: str = "audio/wav"):
    return client.post(
        "/api/v1/transcribe",
        files={"file": (filename, content, mime)},
    )


# --- 纯函数 ---


def test_wav_duration_reads_real_header() -> None:
    assert wav_duration_seconds(make_wav(3.0)) == pytest.approx(3.0, abs=0.01)


def test_wav_duration_returns_none_for_non_wav() -> None:
    """非 WAV 输入退化为不做时长校验，不能抛异常。"""
    assert wav_duration_seconds(b"not a wav at all") is None
    assert wav_duration_seconds(b"") is None
    # 只有 RIFF 头但没有 fmt/data 块
    assert wav_duration_seconds(b"RIFF" + b"\x00" * 40) is None


def test_extract_error_detail_handles_all_upstream_shapes() -> None:
    """上游错误体形态不统一：JSON 对象 / 裸字符串 / 带引号字符串 / 空。"""
    assert extract_error_detail(_FakeResponse(400, '{"message":"bad audio"}')) == "bad audio"
    assert extract_error_detail(_FakeResponse(401, '"Invalid token"')) == "Invalid token"
    assert extract_error_detail(_FakeResponse(403, "Forbidden")) == "Forbidden"
    assert extract_error_detail(_FakeResponse(503, '{"code":50505,"message":"busy"}')) == "busy"
    assert extract_error_detail(_FakeResponse(400, "")) == ""
    # 无 message 只有 code
    assert "20012" in extract_error_detail(_FakeResponse(400, '{"code":20012}'))
    # 非法 JSON 退化为原文
    assert extract_error_detail(_FakeResponse(500, "<html>oops</html>")) == "<html>oops</html>"


def test_safe_audio_filename_strips_paths_and_junk() -> None:
    assert safe_audio_filename("voice.wav") == "voice.wav"
    assert safe_audio_filename("../../etc/passwd") == "passwd"
    assert safe_audio_filename("C:\\temp\\a.wav") == "a.wav"
    assert safe_audio_filename("") == "audio.wav"
    assert safe_audio_filename(None) == "audio.wav"
    assert safe_audio_filename("x" * 100) == "audio.wav"
    assert safe_audio_filename("bad name!.wav") == "badname.wav"


# --- 端点行为 ---


def test_transcribe_success_returns_text(fake_client) -> None:
    fake_client.response = _FakeResponse(200, '{"text":"明天下午三点开会"}')
    response = post_audio()
    assert response.status_code == 200
    body = response.json()
    assert body["source"] == "siliconflow"
    assert body["text"] == "明天下午三点开会"


def test_transcribe_forwards_model_and_auth_to_upstream(fake_client) -> None:
    """multipart 字段名必须是 file/model，且带 Bearer 认证头。"""
    post_audio()
    captured = fake_client.captured
    assert captured["url"].endswith("/audio/transcriptions")
    assert captured["headers"]["Authorization"] == "Bearer test-key"
    assert captured["files"]["model"] == (None, "TeleAI/TeleSpeechASR")
    assert "file" in captured["files"]


def test_transcribe_uses_configured_model_and_base_url(fake_client, monkeypatch) -> None:
    """模型与 base_url 可配置：SenseVoice 有下线前科，需支持只改环境变量切换。"""
    app.dependency_overrides[get_settings] = lambda: settings_with_key(
        siliconflow_asr_model="TeleAI/TeleSpeechASR",
        siliconflow_base_url="https://example.test/v1/",
    )
    try:
        post_audio()
        assert fake_client.captured["files"]["model"] == (None, "TeleAI/TeleSpeechASR")
        # 结尾多余斜杠不应产生双斜杠
        assert fake_client.captured["url"] == "https://example.test/v1/audio/transcriptions"
    finally:
        app.dependency_overrides[get_settings] = override_settings


def test_transcribe_upstream_bare_string_error_is_reported(fake_client) -> None:
    """401 返回裸字符串 "Invalid token"：必须给出可读提示而不是解析异常。"""
    fake_client.response = _FakeResponse(401, '"Invalid token"')
    response = post_audio()
    assert response.status_code == 200
    body = response.json()
    assert body["source"] == "none"
    assert "API Key 无效" in body["message"]
    assert "Invalid token" in body["message"]


def test_transcribe_upstream_rate_limit_reported(fake_client) -> None:
    fake_client.response = _FakeResponse(
        429, '{"message":"Request was rejected due to rate limiting. Details:TPM limit reached."}'
    )
    response = post_audio()
    assert response.status_code == 200
    body = response.json()
    assert body["source"] == "none"
    assert "频繁" in body["message"]


def test_transcribe_upstream_error_without_message_still_readable(fake_client) -> None:
    """无 message 的错误体不能产生空提示。"""
    fake_client.response = _FakeResponse(500, "")
    response = post_audio()
    body = response.json()
    assert body["source"] == "none"
    assert body["message"]


def test_transcribe_upstream_missing_text_field(fake_client) -> None:
    fake_client.response = _FakeResponse(200, '{"unexpected":1}')
    response = post_audio()
    body = response.json()
    assert body["source"] == "none"
    assert "未返回结果" in body["message"]


def test_transcribe_connect_error_reports_network_message(fake_client) -> None:
    fake_client.response = httpx.ConnectError("proxy down")
    response = post_audio()
    assert response.status_code == 200
    body = response.json()
    assert body["source"] == "none"
    assert "无法连接" in body["message"]


def test_transcribe_timeout_reports_busy_not_network(fake_client) -> None:
    """超时须提示服务繁忙而非检查网络：上游免费模型延迟波动大，
    超时多因排队，混成「检查网络」会把用户引向错误方向（同 F-039 修正）。"""
    fake_client.response = httpx.ReadTimeout("slow")
    response = post_audio()
    body = response.json()
    assert body["source"] == "none"
    assert "超时" in body["message"]
    assert "网络" not in body["message"]


def test_transcribe_503_when_key_not_configured() -> None:
    """未配置 Key 时明确告知不可用，而不是 500 或静默失败。"""
    app.dependency_overrides[get_settings] = lambda: settings_with_key(
        siliconflow_api_key=None
    )
    try:
        response = post_audio()
        assert response.status_code == 503
        assert "SILICONFLOW_API_KEY" in response.json()["detail"]
    finally:
        app.dependency_overrides[get_settings] = override_settings


def test_transcribe_rejects_empty_audio() -> None:
    response = post_audio(content=b"")
    assert response.status_code == 400
    assert "未收到音频" in response.json()["detail"]


def test_transcribe_rejects_oversized_audio() -> None:
    app.dependency_overrides[get_settings] = lambda: settings_with_key(
        max_audio_bytes=1024
    )
    try:
        response = post_audio(content=b"\x00" * 2048)
        assert response.status_code == 413
        assert "上限" in response.json()["detail"]
    finally:
        app.dependency_overrides[get_settings] = override_settings


def test_transcribe_rejects_too_long_audio() -> None:
    """真实 WAV 头可读出时长，超过上限即拒绝，避免浪费上游配额。"""
    app.dependency_overrides[get_settings] = lambda: settings_with_key(
        max_audio_seconds=5
    )
    try:
        response = post_audio(content=make_wav(10.0))
        assert response.status_code == 413
        assert "时长" in response.json()["detail"]
    finally:
        app.dependency_overrides[get_settings] = override_settings


def test_transcribe_accepts_audio_within_duration_limit(fake_client) -> None:
    app.dependency_overrides[get_settings] = lambda: settings_with_key(
        max_audio_seconds=30
    )
    try:
        response = post_audio(content=make_wav(3.0))
        assert response.status_code == 200
        assert response.json()["source"] == "siliconflow"
    finally:
        app.dependency_overrides[get_settings] = override_settings


def test_transcribe_rejects_non_audio_content_type() -> None:
    response = post_audio(content=b"hello", mime="text/plain")
    assert response.status_code == 400
    assert "不支持的音频类型" in response.json()["detail"]


def test_transcribe_rate_limit_returns_429_after_quota(fake_client) -> None:
    for _ in range(10):
        assert post_audio().status_code == 200
    assert post_audio().status_code == 429
