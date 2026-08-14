from __future__ import annotations

from fastapi import APIRouter, Depends, Request

from app.config import Settings, get_settings
from app.limiter import limiter
from app.schemas import ConflictCheckRequest, ConflictCheckResponse
from app.services.conflict import split_schedule_conflicts


router = APIRouter()


@router.post("/conflicts/check", response_model=ConflictCheckResponse)
@limiter.limit("30/minute")
def check_conflicts(
    request: Request,
    payload: ConflictCheckRequest,
    settings: Settings = Depends(get_settings),
) -> ConflictCheckResponse:
    accepted, blocked = split_schedule_conflicts(payload.schedules, payload.existing_blocks)
    return ConflictCheckResponse(accepted=accepted, blocked=blocked)
