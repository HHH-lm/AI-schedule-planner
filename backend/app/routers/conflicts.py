from __future__ import annotations

from fastapi import APIRouter

from app.schemas import ConflictCheckRequest, ConflictCheckResponse
from app.services.conflict import split_schedule_conflicts


router = APIRouter()


@router.post("/conflicts/check", response_model=ConflictCheckResponse)
def check_conflicts(payload: ConflictCheckRequest) -> ConflictCheckResponse:
    accepted, blocked = split_schedule_conflicts(payload.schedules, payload.existing_blocks)
    return ConflictCheckResponse(accepted=accepted, blocked=blocked)
