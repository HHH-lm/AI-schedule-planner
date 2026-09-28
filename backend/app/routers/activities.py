"""活动证据 → 候选记录端点（F-045）；本机采集与证据列表（F-046）。

入站鉴权与其他端点一致（无），用限流 + 证据体积上限兜底；结构非法 400、
体积超限 413（语义与 /transcribe 一致）。证据文件只含元数据（时间戳、
会话 ID、工具名、提交信息、文件路径），不含消息正文或文件内容。
"""

from __future__ import annotations

import json
from datetime import date as date_cls, timedelta
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import ValidationError

from app import activity_collector
from app.config import Settings, get_settings
from app.limiter import limiter
from app.schemas import (
    ActivityCollectItem,
    ActivityCollectRequest,
    ActivityCollectResponse,
    ActivityDigestRequest,
    ActivityDigestResponse,
    ActivityEvidence,
    ActivityEvidenceListItem,
    ActivityEvidenceListResponse,
    ActivityEvidenceSummary,
)
from app.services.activity_digest import digest_activities


router = APIRouter()

# 证据输出目录锚定 backend/ 包位置（app/routers/ 的上两级），不依赖启动 cwd；
# 与 CLI `npm run collect:activity`（cwd=backend，默认 ./activity_evidence）同目录互相覆盖
EVIDENCE_OUT_DIR = Path(__file__).resolve().parents[2] / "activity_evidence"

MAX_COLLECT_RANGE_DAYS = 31

LOCAL_ONLY_DETAIL = (
    "仅本地模式可用：本机采集需要访问你电脑上的使用记录（ZCode 会话库），"
    "当前后端缺少本机数据源。请在本地启动后端（npm run dev）后使用，"
    "或改用「导入活动」选择证据文件"
)


def _local_sources_available() -> bool:
    return (
        Path(activity_collector.ZCODE_DB_PATH).expanduser().is_file()
        or Path(activity_collector.ZCODE_LOG_DIR).expanduser().is_dir()
    )


def _ensure_local_sources() -> None:
    if not _local_sources_available():
        raise HTTPException(status_code=409, detail=LOCAL_ONLY_DETAIL)


def _evidence_summary(evidence: dict[str, Any]) -> ActivityEvidenceSummary:
    sources = evidence.get("sources") or {}
    zcode = sources.get("zcode") or {}
    git = sources.get("git") or {}
    files = sources.get("files") or {}
    return ActivityEvidenceSummary(
        zcode_sessions=len(zcode.get("sessions") or []),
        git_commits=sum(len(repo.get("commits") or []) for repo in git.get("repos") or []),
        files=len(files.get("files") or []),
    )


def _collect_day(day: date_cls) -> dict[str, Any]:
    # 路径经模块属性晚绑定读取：测试可 monkeypatch activity_collector 常量替换数据源
    return activity_collector.build_evidence(
        day,
        zcode_db_path=activity_collector.ZCODE_DB_PATH,
        zcode_log_dir=activity_collector.ZCODE_LOG_DIR,
        repos=activity_collector.DEFAULT_REPOS,
        scan_dirs=activity_collector.DEFAULT_SCAN_DIRS,
    )


def _parse_collect_date(value: str | None, field: str) -> date_cls | None:
    if value is None:
        return None
    try:
        return date_cls.fromisoformat(value)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"{field} 需为 YYYY-MM-DD 格式日期，收到：{value!r}",
        ) from None


@router.post("/activities/collect", response_model=ActivityCollectResponse)
@limiter.limit("10/minute")
def activities_collect(
    request: Request,
    payload: ActivityCollectRequest | None = None,
) -> ActivityCollectResponse:
    """本机采集活动证据（F-046）：逐日 build_evidence + 落盘，返回供前端逐日导入。

    仅本地后端可用（云端无本机数据源 → 409）；同步阻塞（只读 sqlite + git 子进程
    + os.walk），def 端点由 FastAPI 调度进线程池。单日失败只在该日项标 error。
    """
    _ensure_local_sources()
    today = date_cls.today()
    start = _parse_collect_date(payload.from_date if payload else None, "from")
    end = _parse_collect_date(payload.to_date if payload else None, "to")
    if start is None:
        start = end if end is not None else today
    if end is None:
        end = start
    if start > end:
        raise HTTPException(status_code=400, detail="from 不能晚于 to")
    if end > today:
        raise HTTPException(status_code=400, detail="不能检索未来日期")
    if (end - start).days + 1 > MAX_COLLECT_RANGE_DAYS:
        raise HTTPException(
            status_code=400, detail=f"检索区间过长（上限 {MAX_COLLECT_RANGE_DAYS} 天）"
        )

    items: list[ActivityCollectItem] = []
    for offset in range((end - start).days + 1):
        day = start + timedelta(days=offset)
        try:
            evidence = _collect_day(day)
            path = activity_collector.write_evidence(evidence, EVIDENCE_OUT_DIR)
            items.append(
                ActivityCollectItem(
                    date=day.isoformat(),
                    filename=path.name,
                    summary=_evidence_summary(evidence),
                    evidence=ActivityEvidence.model_validate(evidence),
                )
            )
        except Exception as error:  # noqa: BLE001 单日失败不中断整批
            items.append(
                ActivityCollectItem(date=day.isoformat(), error=str(error) or "采集失败")
            )
    return ActivityCollectResponse(items=items)


@router.get("/activities/evidence", response_model=ActivityEvidenceListResponse)
@limiter.limit("30/minute")
def activities_evidence_list(request: Request) -> ActivityEvidenceListResponse:
    """列出已落盘证据文件的摘要（不含全量 evidence），供统计页判断缺采与待审。"""
    _ensure_local_sources()
    if not EVIDENCE_OUT_DIR.is_dir():
        return ActivityEvidenceListResponse(items=[])
    items: list[ActivityEvidenceListItem] = []
    for path in sorted(EVIDENCE_OUT_DIR.glob("activity_evidence_*.json")):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue  # 损坏文件跳过，不阻塞列表
        if not isinstance(data, dict) or not isinstance(data.get("date"), str):
            continue
        generated_at = data.get("generated_at")
        items.append(
            ActivityEvidenceListItem(
                date=data["date"],
                filename=path.name,
                generated_at=generated_at if isinstance(generated_at, str) else None,
                summary=_evidence_summary(data),
            )
        )
    items.sort(key=lambda item: item.date, reverse=True)
    return ActivityEvidenceListResponse(items=items)


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
