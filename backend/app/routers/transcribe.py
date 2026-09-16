"""语音转文字端点：接收浏览器录制的音频，转发到 SiliconFlow 识别。

入站鉴权与其他端点一致（无），因此用限流 + 时长/体积上限兜住免费额度被滥用。
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile

from app.config import Settings, get_settings
from app.limiter import limiter
from app.schemas import TranscribeResponse
from app.services.asr import safe_audio_filename, transcribe_audio, wav_duration_seconds


router = APIRouter()

# 前端按 MediaRecorder 探测结果上传，这里只做粗筛；具体格式支持与否由上游判定
ALLOWED_AUDIO_PREFIXES = ("audio/", "video/")


@router.post("/transcribe", response_model=TranscribeResponse)
@limiter.limit("10/minute")
async def transcribe(
    request: Request,
    file: UploadFile = File(...),
    settings: Settings = Depends(get_settings),
) -> TranscribeResponse:
    if not settings.siliconflow_api_key:
        raise HTTPException(
            status_code=503,
            detail="服务端未配置语音识别 Key（SILICONFLOW_API_KEY），语音输入暂不可用",
        )

    audio = await file.read()
    if not audio:
        raise HTTPException(status_code=400, detail="未收到音频数据，请重新录音")
    if len(audio) > settings.max_audio_bytes:
        limit_mb = settings.max_audio_bytes // (1024 * 1024)
        raise HTTPException(
            status_code=413,
            detail=f"录音文件超过 {limit_mb}MB 上限，请缩短录音时长",
        )

    content_type = (file.content_type or "").lower()
    if content_type and not content_type.startswith(ALLOWED_AUDIO_PREFIXES):
        raise HTTPException(status_code=400, detail="不支持的音频类型")

    duration = wav_duration_seconds(audio)
    if duration is not None and duration > settings.max_audio_seconds:
        raise HTTPException(
            status_code=413,
            detail=f"录音时长超过 {settings.max_audio_seconds} 秒上限，请分段录入",
        )

    return await transcribe_audio(
        audio,
        safe_audio_filename(file.filename),
        content_type or "audio/wav",
        settings,
    )
