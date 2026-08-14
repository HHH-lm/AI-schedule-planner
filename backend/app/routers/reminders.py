from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Request

from app.config import Settings, get_settings
from app.limiter import limiter
from app.services.push import push_channel_ready
from app.services.reminders import scan_reminders


router = APIRouter()


@router.get("/reminders/status")
@limiter.limit("30/minute")
def reminders_status(
    request: Request,
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    return {
        "enabled": bool(
            settings.supabase_url
            and settings.supabase_service_role_key
            and push_channel_ready(settings)
        ),
        "channel": settings.wechat_push_type,
        "scan_seconds": settings.reminder_scan_seconds,
    }


@router.post("/reminders/run")
@limiter.limit("10/minute")
async def run_reminders(
    request: Request,
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    return await scan_reminders(settings)
