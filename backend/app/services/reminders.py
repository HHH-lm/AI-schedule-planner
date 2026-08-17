"""定时提醒：扫描 Supabase 中到达提醒时间的时间块并推送微信。"""

from __future__ import annotations

import logging
import time
from datetime import date, datetime, timedelta, timezone
from typing import Any

import httpx

from app.config import Settings
from app.logging_setup import (
    get_logger,
    log_event,
    reset_request_id,
    set_request_id,
)
from app.services.push import push_channel_ready, push_wechat_message


logger = get_logger("app.reminders")

SUPABASE_TIMEOUT = 15.0


def parse_remind_at(value: Any) -> datetime | None:
    if not isinstance(value, str):
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def collect_due_blocks(
    rows: list[dict[str, Any]], now: datetime
) -> list[dict[str, Any]]:
    """从 schedule_state 行中筛选到期待提醒时间的时间块。"""
    due: list[dict[str, Any]] = []
    for row in rows:
        user_id = row.get("user_id")
        data = row.get("data")
        if not user_id or not isinstance(data, dict):
            continue
        blocks = data.get("timeBlocks")
        if not isinstance(blocks, list):
            continue
        for block in blocks:
            if not isinstance(block, dict) or not block.get("id"):
                continue
            remind_at = parse_remind_at(block.get("remindAt"))
            if remind_at is None:
                continue
            if remind_at <= now:
                due.append(
                    {
                        "user_id": user_id,
                        "block": block,
                        "remind_at": remind_at,
                    }
                )
    return due


def format_reminder_message(block: dict[str, Any]) -> str:
    name = str(block.get("name") or "未命名事项")
    date = str(block.get("date") or "")
    start = int(block.get("start") or 0)
    end = int(block.get("end") or start)
    location = block.get("location")

    def clock(minutes: int) -> str:
        safe = max(0, min(1439, minutes))
        return f"{safe // 60:02d}:{safe % 60:02d}"

    def end_label() -> str:
        if end <= 1440:
            return clock(end)
        day_offset = end // 1440
        end_clock = clock(end % 1440)
        if day_offset == 1:
            return f"次日{end_clock}"
        try:
            end_day = date.fromisoformat(date) + timedelta(days=day_offset)
            return f"{end_day.isoformat()} {end_clock}"
        except ValueError:
            return f"+{day_offset}天{end_clock}"

    lines = [f"日程提醒：{name}", f"日期：{date}", f"时间：{clock(start)}-{end_label()}"]
    if location:
        lines.append(f"地点：{location}")
    return "\n".join(lines)


def _rest_headers(settings: Settings) -> dict[str, str]:
    key = settings.supabase_service_role_key or ""
    return {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }


def _base_url(settings: Settings) -> str:
    return (settings.supabase_url or "").rstrip("/")


async def fetch_schedule_rows(settings: Settings) -> list[dict[str, Any]]:
    url = f"{_base_url(settings)}/rest/v1/schedule_state"
    async with httpx.AsyncClient(timeout=SUPABASE_TIMEOUT) as client:
        response = await client.get(
            url,
            params={"select": "user_id,data"},
            headers=_rest_headers(settings),
        )
        response.raise_for_status()
        return response.json()


async def fetch_pushed_reminders(
    settings: Settings,
) -> set[tuple[str, str, str]]:
    url = f"{_base_url(settings)}/rest/v1/reminder_log"
    async with httpx.AsyncClient(timeout=SUPABASE_TIMEOUT) as client:
        response = await client.get(
            url,
            params={"select": "user_id,block_id,remind_at"},
            headers=_rest_headers(settings),
        )
        response.raise_for_status()
        rows = response.json()
    result: set[tuple[str, str, str]] = set()
    for row in rows:
        user_id = row.get("user_id")
        block_id = row.get("block_id")
        remind_at = row.get("remind_at")
        if user_id and block_id and remind_at:
            result.add((str(user_id), str(block_id), str(remind_at)))
    return result


async def insert_reminder_log(
    settings: Settings,
    user_id: str,
    block_id: str,
    remind_at: datetime,
) -> None:
    url = f"{_base_url(settings)}/rest/v1/reminder_log"
    payload = {
        "user_id": user_id,
        "block_id": block_id,
        "remind_at": remind_at.astimezone(timezone.utc).isoformat(),
        "pushed_at": datetime.now(timezone.utc).isoformat(),
    }
    headers = {**_rest_headers(settings), "Prefer": "resolution=ignore-duplicates"}
    async with httpx.AsyncClient(timeout=SUPABASE_TIMEOUT) as client:
        response = await client.post(url, json=payload, headers=headers)
        response.raise_for_status()


async def scan_reminders(settings: Settings) -> dict[str, Any]:
    scan_id = f"scan-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%f')}"
    token = set_request_id(scan_id)
    started = time.perf_counter()
    try:
        if not settings.supabase_url or not settings.supabase_service_role_key:
            return {
                "enabled": False,
                "reason": "SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY 未配置",
                "checked": 0,
                "pushed": 0,
                "skipped": 0,
                "errors": [],
            }
        if not push_channel_ready(settings):
            return {
                "enabled": False,
                "reason": "微信推送通道未配置",
                "checked": 0,
                "pushed": 0,
                "skipped": 0,
                "errors": [],
            }

        log_event(logger, logging.INFO, "reminder.scan.start", scan_id=scan_id)
        rows = await fetch_schedule_rows(settings)
        due = collect_due_blocks(rows, datetime.now(timezone.utc))
        log_event(
            logger,
            logging.INFO,
            "reminder.scan.due",
            scan_id=scan_id,
            checked=len(rows),
            due=len(due),
        )
        if not due:
            log_event(
                logger,
                logging.INFO,
                "reminder.scan.done",
                scan_id=scan_id,
                checked=len(rows),
                due=0,
                pushed=0,
                skipped=0,
                errors=0,
                duration_ms=round((time.perf_counter() - started) * 1000, 2),
            )
            return {
                "enabled": True,
                "checked": len(rows),
                "pushed": 0,
                "skipped": 0,
                "errors": [],
            }

        pushed_keys = await fetch_pushed_reminders(settings)
        pushed = 0
        skipped = 0
        errors: list[str] = []
        for item in due:
            user_id = str(item["user_id"])
            block = item["block"]
            block_id = str(block["id"])
            remind_at = item["remind_at"].astimezone(timezone.utc)
            key = (user_id, block_id, remind_at.isoformat())
            if key in pushed_keys:
                skipped += 1
                log_event(
                    logger,
                    logging.INFO,
                    "reminder.push.skipped",
                    scan_id=scan_id,
                    block_id=block_id,
                )
                continue
            try:
                message = format_reminder_message(block)
                ok = await push_wechat_message(message, settings)
                if not ok:
                    errors.append(f"push failed: {block_id}")
                    continue
                await insert_reminder_log(settings, user_id, block_id, remind_at)
                pushed += 1
            except Exception as exc:  # noqa: BLE001 - 单条失败不影响其他提醒
                log_event(
                    logger,
                    logging.ERROR,
                    "reminder.push.failed",
                    scan_id=scan_id,
                    block_id=block_id,
                    error=str(exc)[:300],
                )
                errors.append(f"{block_id}: {exc}")

        log_event(
            logger,
            logging.INFO,
            "reminder.scan.done",
            scan_id=scan_id,
            checked=len(rows),
            due=len(due),
            pushed=pushed,
            skipped=skipped,
            errors=len(errors),
            duration_ms=round((time.perf_counter() - started) * 1000, 2),
        )
        return {
            "enabled": True,
            "checked": len(rows),
            "pushed": pushed,
            "skipped": skipped,
            "errors": errors,
        }
    except Exception as exc:  # noqa: BLE001 - 扫描失败需记录并安全返回
        log_event(
            logger,
            logging.ERROR,
            "reminder.scan.error",
            scan_id=scan_id,
            error=str(exc)[:300],
            duration_ms=round((time.perf_counter() - started) * 1000, 2),
        )
        return {
            "enabled": True,
            "checked": 0,
            "pushed": 0,
            "skipped": 0,
            "errors": [str(exc)],
        }
    finally:
        reset_request_id(token)
