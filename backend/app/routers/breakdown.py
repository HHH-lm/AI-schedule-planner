from __future__ import annotations

from fastapi import APIRouter, Depends

from app.config import Settings, get_settings
from app.schemas import BreakdownRequest, BreakdownResponse
from app.services.planner import breakdown_tasks


router = APIRouter()


@router.post("/breakdown", response_model=BreakdownResponse)
async def breakdown(
    payload: BreakdownRequest, settings: Settings = Depends(get_settings)
) -> BreakdownResponse:
    return await breakdown_tasks(payload.plan, payload.provider, payload.today, settings)
