from __future__ import annotations

from fastapi import APIRouter, Depends

from app.config import Settings, get_settings
from app.schemas import PlanRequest, PlanResponse
from app.services.planner import plan_schedule


router = APIRouter()


@router.post("/plan", response_model=PlanResponse)
async def plan(
    payload: PlanRequest, settings: Settings = Depends(get_settings)
) -> PlanResponse:
    return await plan_schedule(payload, settings)
