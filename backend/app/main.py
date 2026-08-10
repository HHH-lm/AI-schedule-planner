from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import breakdown, conflicts, health, parse, plan


settings = get_settings()

app = FastAPI(
    title="AI 日程管理系统 API",
    description="自然语言解析、任务拆解、时间规划与冲突检测服务",
    version=settings.version,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

for router in (health.router, parse.router, breakdown.router, plan.router, conflicts.router):
    app.include_router(router, prefix="/api/v1")
