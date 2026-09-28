"""活动证据 → 候选记录端点（F-045）。

入站鉴权与其他端点一致（无），用限流 + 证据体积上限兜底；结构非法 400、
体积超限 413（语义与 /transcribe 一致）。证据文件只含元数据（时间戳、
会话 ID、工具名、提交信息、文件路径），不含消息正文或文件内容。
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import ValidationError

from app.config import Settings, get_settings
from app.limiter import limiter
from app.schemas import ActivityDigestRequest, ActivityDigestResponse
from app.services.activity_digest import digest_activities


router = APIRouter()


@router.post("/activities/digest", response_model=ActivityDigestResponse)
@limiter.limit("10/minute")
async def activities_digest(
    request: Request,
    settings: Settings = Depends(get_settings),
) -> ActivityDigestResponse:
    body = await request.body()
    if len(body) > settings.max_activity_evidence_bytes:
        limit_mb = settings.max_activity_evidence_bytes // (1024 * 1024)
        raise HTTPException(
            status_code=413,
            detail=f"证据文件超过 {limit_mb}MB 上限，请缩短日期范围或减小文件",
        )
    try:
        payload = ActivityDigestRequest.model_validate_json(body)
    except ValidationError as error:
        raise HTTPException(
            status_code=400,
            detail=f"证据文件结构不符合要求：{error.errors()[0].get('msg', '格式错误')}",
        ) from error
    return await digest_activities(payload, payload.provider, settings, api_key=payload.api_key)
