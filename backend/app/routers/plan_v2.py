"""Planning V2 路由 - 结构化规划上下文。"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.config import Settings, get_settings
from app.schemas import PlanV2Request, PlanV2Response
from app.services.planner_v2 import plan_v2_schedule

router = APIRouter()


@router.post("/plan-v2", response_model=PlanV2Response)
async def plan_v2(
    payload: PlanV2Request, settings: Settings = Depends(get_settings)
) -> PlanV2Response:
    """结构化规划：目标 + 任务（优先级/时长/截止日）+ 记忆 + 约束 + 已有日程 + 规划范围。"""
    return await plan_v2_schedule(payload, settings)
