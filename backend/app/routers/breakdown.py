from __future__ import annotations

from fastapi import APIRouter, Depends, Request

from app.config import Settings, get_settings
from app.limiter import limiter
from app.schemas import BreakdownRequest, BreakdownResponse
from app.services.planner import breakdown_tasks


router = APIRouter()


@router.post("/breakdown", response_model=BreakdownResponse)
@limiter.limit("10/minute")
async def breakdown(
    request: Request,
    payload: BreakdownRequest,
    settings: Settings = Depends(get_settings),
) -> BreakdownResponse:
    return await breakdown_tasks(
        payload.plan, payload.provider, payload.today, settings,
        api_key=payload.api_key,
    )
