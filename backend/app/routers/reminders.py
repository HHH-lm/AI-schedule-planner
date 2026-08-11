from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends

from app.config import Settings, get_settings
from app.services.push import push_channel_ready
from app.services.reminders import scan_reminders


router = APIRouter()


@router.get("/reminders/status")
def reminders_status(settings: Settings = Depends(get_settings)) -> dict[str, Any]:
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
async def run_reminders(settings: Settings = Depends(get_settings)) -> dict[str, Any]:
    return await scan_reminders(settings)
