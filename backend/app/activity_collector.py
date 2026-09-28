"""本机活动证据采集：扫 ZCode 会话库 / git 提交 / 白名单目录文件变动。

产出元数据级证据 JSON（时间戳、会话标题、项目目录、编辑文件、命令首词、
提交信息、文件路径），不读取任何消息正文或文件内容；统计页「导入今日活动」
流程把该文件经 POST /api/v1/activities/digest 归纳为候选记录，人工确认后落库。

用法（在 backend 目录下）：
    .venv/bin/python -m app.activity_collector                       # 采集今天
    .venv/bin/python -m app.activity_collector --date 2026-09-25     # 回填任意历史日期
    .venv/bin/python -m app.activity_collector --from 2026-09-21 --to 2026-09-27
可选 --repo / --dir 覆盖默认仓库与扫描目录；--out 指定输出目录。

三类证据的可回溯深度不同：git 提交完整历史都在；文件按现存文件的 mtime
回填；ZCode 会话优先读会话库 db.sqlite（保留约 31 天，带标题/文件/命令），
不可用时回退每日 JSONL 日志（仅 7 天、只有时间窗与工具名）。
会话按 SESSION_IDLE_GAP（15 分钟）空闲切出连续活动段（segments），
段间长空闲不计入候选窗口——整天挂机但只干了几活的会话不再连成一条。
"""

from __future__ import annotations

import argparse
import json
import os
import sqlite3
import subprocess
import sys
from collections import Counter
from datetime import date as date_cls
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Callable

EVIDENCE_SCHEMA = "activity-evidence/1"

ZCODE_LOG_DIR = "~/.zcode/cli/log"
ZCODE_DB_PATH = "~/.zcode/cli/db/db.sqlite"
DEFAULT_REPOS = (
    "~/Documents/AI/求职",
    "~/Documents/AI/hqb-market",
    "~/Documents/AI/AI 日程管理系统",
)
DEFAULT_SCAN_DIRS = ("~/Documents/AI",)

# 会话聚合只认这几类事件；未知事件忽略（日志为内部格式，字段可能变化）
SESSION_EVENTS = {
    "tool.call.started",
    "turn.started",
    "model.request.started",
    "turn.phase.started",
}
TOOL_EVENT = "tool.call.started"

# 会话库 part 表里可提取参数的工具：编辑文件与命令首词
EDIT_TOOLS = ("Edit", "Write")
MAX_EDIT_FILES = 8
MAX_COMMANDS = 3

# 会话内相邻工具调用空闲超过该值视为「离开」，切出独立时间段；
# digest 的归并阈值（SESSION_MERGE_GAP）必须 ≤ 该值，否则刚切开的段会被重新缝合
SESSION_IDLE_GAP = timedelta(minutes=15)
SESSION_IDLE_GAP_MS = int(SESSION_IDLE_GAP.total_seconds() * 1000)
# 每会话分段上限（15 分钟阈值下单日理论上限 96 段，正常分布远达不到）
MAX_SESSION_SEGMENTS = 48

MAX_FILES = 300
MAX_RANGE_DAYS = 366
# 内容无意义的重目录；隐藏目录（.git/.next/.venv 等）一律跳过
SKIP_DIR_NAMES = {"node_modules", "__pycache__", "dist", "build", "coverage"}
# 系统垃圾文件：进不了证据，也不该生成「更新 1 个文件」类候选
JUNK_FILE_NAMES = {".DS_Store", "Thumbs.db", "desktop.ini"}
JUNK_FILE_SUFFIXES = (".tmp", ".swp", ".swo")

RunCommand = Callable[..., subprocess.CompletedProcess]


def _split_bursts(
    rows: list[tuple[int, int | None]]
) -> list[tuple[datetime, datetime]]:
    """把单个会话的工具调用行按空闲间隔切成连续活动段。

    相邻行与当前段尾的间隔 > SESSION_IDLE_GAP 即切段（重叠行只延伸段尾）；
    completed_at 缺失的行退化为 started_at。单次执行计入存在感不超过
    SESSION_IDLE_GAP——后台工作流/监控进程会挂数小时（实测单次 854 分钟），
    不封顶会把整天桥成一条。rows 须按 started_at 升序。
    """
    bursts: list[list[int]] = []
    for started_at, completed_at in rows:
        row_end = (
            completed_at
            if completed_at is not None and completed_at > started_at
            else started_at
        )
        row_end = min(row_end, started_at + SESSION_IDLE_GAP_MS)
        if bursts and started_at - bursts[-1][1] <= SESSION_IDLE_GAP_MS:
            bursts[-1][1] = max(bursts[-1][1], row_end)
        else:
            bursts.append([started_at, row_end])
    return [
        (
            datetime.fromtimestamp(start / 1000).astimezone(),
            datetime.fromtimestamp(end / 1000).astimezone(),
        )
        for start, end in bursts
    ]


def collect_zcode_sessions_from_db(
    db_path: Path, day: date_cls
) -> dict[str, Any] | None:
    """从 ZCode 会话库（db.sqlite，保留约 31 天）聚合当日会话证据。

    只读打开；提取标题、项目目录、编辑文件、命令首词，不含消息正文与文件内容。
    每个会话的 tool_usage 行按空闲间隔切段（segments），会话级 start/end 为
    首段开始到末段结束的包络。会话库不存在/损坏/表结构不符时返回 None，
    由调用方回退每日 JSONL 日志。
    """
    if not db_path.is_file():
        return None
    day_start_ms = int(datetime(day.year, day.month, day.day).timestamp() * 1000)
    day_end_ms = day_start_ms + 86400 * 1000
    try:
        connection = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
        try:
            usage_rows = connection.execute(
                "SELECT session_id, started_at, completed_at "
                "FROM tool_usage WHERE started_at >= ? AND started_at < ? "
                "ORDER BY session_id, started_at",
                (day_start_ms, day_end_ms),
            ).fetchall()
            part_rows = connection.execute(
                "SELECT session_id, json_extract(data,'$.tool') AS tool, "
                "json_extract(data,'$.state.input.file_path') AS file_path, "
                "json_extract(data,'$.state.input.command') AS command "
                "FROM part WHERE json_extract(data,'$.type')='tool' "
                "AND time_created >= ? AND time_created < ?",
                (day_start_ms, day_end_ms),
            ).fetchall()
            session_meta = {
                row[0]: (row[1], row[2])
                for row in connection.execute("SELECT id, title, directory FROM session")
            }
        finally:
            connection.close()
    except (sqlite3.Error, OSError):
        return None

    files_by_session: dict[str, list[str]] = {}
    commands_by_session: dict[str, Counter[str]] = {}
    for session_id, tool, file_path, command in part_rows:
        if tool in EDIT_TOOLS and file_path:
            files = files_by_session.setdefault(session_id, [])
            if file_path not in files:
                files.append(file_path)
        elif tool == "Bash" and command:
            first_word = str(command).split()
            if first_word:
                commands_by_session.setdefault(session_id, Counter())[first_word[0]] += 1

    rows_by_session: dict[str, list[tuple[int, int | None]]] = {}
    for session_id, started_at, completed_at in usage_rows:
        rows_by_session.setdefault(session_id, []).append((started_at, completed_at))

    sessions = []
    truncation_notes: list[str] = []
    for session_id, rows in rows_by_session.items():
        segments = _split_bursts(rows)
        if not segments:  # WHERE 过滤保证至少一行，防御性跳过
            continue
        if len(segments) > MAX_SESSION_SEGMENTS:
            segments = segments[:MAX_SESSION_SEGMENTS]
            truncation_notes.append(
                f"会话 {session_id[:8]} 分段超过 {MAX_SESSION_SEGMENTS}，已截断"
            )
        first_start, last_end = segments[0][0], segments[-1][1]
        title, directory = session_meta.get(session_id, (None, None))
        sessions.append(
            {
                "session_id": session_id,
                "title": title,
                "directory": directory,
                "start": first_start.isoformat(timespec="seconds"),
                "end": last_end.isoformat(timespec="seconds"),
                "tool_calls": len(rows),
                "segments": [
                    {
                        "start": start.isoformat(timespec="seconds"),
                        "end": end.isoformat(timespec="seconds"),
                    }
                    for start, end in segments
                ],
                "files_edited": files_by_session.get(session_id, [])[:MAX_EDIT_FILES],
                "commands": [
                    name
                    for name, _ in commands_by_session.get(session_id, Counter()).most_common(MAX_COMMANDS)
                ],
            }
        )
    sessions.sort(key=lambda session: session["start"])
    return {"available": True, "note": "；".join(truncation_notes) or None, "sessions": sessions}


def collect_zcode_sessions(log_path: Path, day: date_cls) -> dict[str, Any]:
    """解析当日 ZCode 日志，按 sessionId 聚出会话活动段与工具调用计数。

    只取 event 名、timestamp、sessionId 与 toolName；消息正文一律不读。
    事件时间戳同样按空闲间隔切段（segments），语义与会话库路径一致。
    """
    if not log_path.is_file():
        return {"available": False, "note": f"日志不存在：{log_path}", "sessions": []}
    spans: dict[str, dict[str, Any]] = {}
    try:
        with log_path.open("r", encoding="utf-8", errors="replace") as handle:
            for line in handle:
                line = line.strip()
                if not line:
                    continue
                try:
                    record = json.loads(line)
                except ValueError:
                    continue
                if not isinstance(record, dict) or record.get("event") not in SESSION_EVENTS:
                    continue
                session_id = record.get("sessionId")
                timestamp = _parse_timestamp(record.get("timestamp"))
                if not isinstance(session_id, str) or not session_id or timestamp is None:
                    continue
                local = timestamp.astimezone()
                if local.date() != day:
                    continue
                span = spans.setdefault(session_id, {"times": [], "tools": Counter()})
                span["times"].append(local)
                context = record.get("context")
                tool_name = context.get("toolName") if isinstance(context, dict) else None
                if record.get("event") == TOOL_EVENT and isinstance(tool_name, str) and tool_name:
                    span["tools"][tool_name] += 1
    except OSError as error:
        return {"available": False, "note": f"日志不可读：{error}", "sessions": []}

    sessions = []
    for session_id, span in sorted(spans.items(), key=lambda item: min(item[1]["times"])):
        bursts: list[list[datetime]] = []
        for local in sorted(span["times"]):
            if bursts and local - bursts[-1][1] <= SESSION_IDLE_GAP:
                bursts[-1][1] = local
            else:
                bursts.append([local, local])
        sessions.append(
            {
                "session_id": session_id,
                "start": bursts[0][0].isoformat(timespec="seconds"),
                "end": bursts[-1][1].isoformat(timespec="seconds"),
                "tool_calls": sum(span["tools"].values()),
                "segments": [
                    {
                        "start": start.isoformat(timespec="seconds"),
                        "end": end.isoformat(timespec="seconds"),
                    }
                    for start, end in bursts
                ],
                "top_tools": [
                    {"name": name, "count": count}
                    for name, count in span["tools"].most_common(5)
                ],
            }
        )
    return {"available": True, "note": None, "sessions": sessions}


def collect_git_commits(
    repo_paths: list[Path], day: date_cls, run: RunCommand = subprocess.run
) -> dict[str, Any]:
    """收集各仓库当日提交（哈希、作者时间、提交主题）。"""
    since = f"{day.isoformat()} 00:00:00"
    until = f"{(day + timedelta(days=1)).isoformat()} 00:00:00"
    repos: list[dict[str, Any]] = []
    notes: list[str] = []
    for repo in repo_paths:
        if not (repo / ".git").exists():
            notes.append(f"跳过（非 git 仓库）：{repo}")
            continue
        result = run(
            [
                "git",
                "-C",
                str(repo),
                "log",
                f"--since={since}",
                f"--until={until}",
                "--format=%H|%aI|%s",
            ],
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            stderr_lines = (result.stderr or "").strip().splitlines()
            detail = stderr_lines[-1][:120] if stderr_lines else f"git 退出码 {result.returncode}"
            notes.append(f"跳过（{repo.name}）：{detail}")
            continue
        commits = []
        for line in (result.stdout or "").splitlines():
            parts = line.split("|", 2)
            if len(parts) != 3:
                continue
            commit_hash, committed_at, subject = parts
            commits.append(
                {"hash": commit_hash, "time": committed_at or None, "subject": subject}
            )
        if commits:
            repos.append({"path": str(repo), "name": repo.name, "commits": commits})
    return {"available": True, "note": "；".join(notes) or None, "repos": repos}


def is_junk_file(name: str) -> bool:
    """系统/编辑器垃圾文件与点文件（.env/.DS_Store/.backend.log 等）不进证据。"""
    if name.startswith(".") or name in JUNK_FILE_NAMES or name.startswith("~$"):
        return True
    return name.endswith(JUNK_FILE_SUFFIXES)


def collect_changed_files(scan_dirs: list[Path], day: date_cls) -> dict[str, Any]:
    """扫描白名单目录中当日修改的文件（跳过隐藏目录与重目录）。"""
    next_day = day + timedelta(days=1)
    start_ts = datetime(day.year, day.month, day.day).timestamp()
    end_ts = datetime(next_day.year, next_day.month, next_day.day).timestamp()
    notes: list[str] = []
    matched: list[tuple[float, str]] = []
    for scan_dir in scan_dirs:
        if not scan_dir.is_dir():
            notes.append(f"跳过（目录不存在）：{scan_dir}")
            continue
        for root, dir_names, file_names in os.walk(scan_dir):
            dir_names[:] = [
                name
                for name in dir_names
                if not name.startswith(".") and name not in SKIP_DIR_NAMES
            ]
            for name in file_names:
                if is_junk_file(name):
                    continue
                path = os.path.join(root, name)
                try:
                    mtime = os.stat(path).st_mtime
                except OSError:
                    continue
                if start_ts <= mtime < end_ts:
                    matched.append((mtime, path))
    matched.sort(reverse=True)
    truncated = len(matched) > MAX_FILES
    files = [
        {
            "path": path,
            "mtime": datetime.fromtimestamp(mtime).astimezone().isoformat(timespec="seconds"),
        }
        for mtime, path in matched[:MAX_FILES]
    ]
    if truncated:
        notes.append(f"文件数超过 {MAX_FILES}，已按修改时间截断")
    return {
        "available": True,
        "note": "；".join(notes) or None,
        "truncated": truncated,
        "files": files,
    }


def build_evidence(
    day: date_cls,
    *,
    zcode_db_path: str | Path = ZCODE_DB_PATH,
    zcode_log_dir: str | Path = ZCODE_LOG_DIR,
    repos: tuple[str, ...] | list[str] = DEFAULT_REPOS,
    scan_dirs: tuple[str, ...] | list[str] = DEFAULT_SCAN_DIRS,
    generated_at: datetime | None = None,
    run: RunCommand = subprocess.run,
) -> dict[str, Any]:
    """组装单日证据 JSON（元数据级，不含消息正文/文件内容）。"""
    zcode = collect_zcode_sessions_from_db(Path(zcode_db_path).expanduser(), day)
    if zcode is None:
        log_path = Path(zcode_log_dir).expanduser() / f"zcode-{day.isoformat()}.jsonl"
        zcode = collect_zcode_sessions(log_path, day)
        fallback_note = "会话库不可用，已回退每日日志（无标题/文件/命令信号）"
        zcode["note"] = f"{zcode['note']}；{fallback_note}" if zcode["note"] else fallback_note
    return {
        "schema": EVIDENCE_SCHEMA,
        "date": day.isoformat(),
        "generated_at": (
            generated_at or datetime.now().astimezone()
        ).isoformat(timespec="seconds"),
        "sources": {
            "zcode": zcode,
            "git": collect_git_commits(
                [Path(repo).expanduser() for repo in repos], day, run=run
            ),
            "files": collect_changed_files(
                [Path(scan_dir).expanduser() for scan_dir in scan_dirs], day
            ),
        },
    }


def write_evidence(evidence: dict[str, Any], out_dir: Path) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / f"activity_evidence_{evidence['date']}.json"
    with path.open("w", encoding="utf-8") as handle:
        json.dump(evidence, handle, ensure_ascii=False, indent=2)
    return path


def _parse_day(text: str | None, flag: str) -> date_cls:
    try:
        return date_cls.fromisoformat(text or "")
    except ValueError:
        raise SystemExit(f"{flag} 需为 YYYY-MM-DD 格式日期，收到：{text!r}") from None


def _source_counts(evidence: dict[str, Any]) -> str:
    sources = evidence["sources"]
    zcode = len(sources["zcode"]["sessions"])
    commits = sum(len(repo["commits"]) for repo in sources["git"]["repos"])
    files = len(sources["files"]["files"])
    return f"ZCode 会话 {zcode} / git 提交 {commits} / 文件 {files}"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m app.activity_collector",
        description="采集本机活动证据（ZCode 会话 / git 提交 / 文件变动），产出元数据级 JSON",
    )
    parser.add_argument("--date", help="采集日期 YYYY-MM-DD（默认今天）")
    parser.add_argument("--from", dest="from_date", help="区间起 YYYY-MM-DD（与 --to 同用）")
    parser.add_argument("--to", dest="to_date", help="区间止 YYYY-MM-DD（含当日）")
    parser.add_argument("--out", default="activity_evidence", help="输出目录（默认 ./activity_evidence）")
    parser.add_argument(
        "--repo", action="append", default=[], help="git 仓库路径（可重复，默认内置三仓库）"
    )
    parser.add_argument(
        "--dir", action="append", default=[], help="文件扫描目录（可重复，默认 ~/Documents/AI）"
    )
    parser.add_argument("--zcode-log-dir", default=ZCODE_LOG_DIR, help="ZCode 日志目录（回退用）")
    parser.add_argument("--zcode-db", default=ZCODE_DB_PATH, help="ZCode 会话库 db.sqlite 路径")
    args = parser.parse_args(argv)

    if args.from_date or args.to_date:
        start = _parse_day(args.from_date, "--from")
        end = _parse_day(args.to_date, "--to")
        if start > end:
            raise SystemExit("--from 不能晚于 --to")
        if (end - start).days + 1 > MAX_RANGE_DAYS:
            raise SystemExit(f"日期区间过长（上限 {MAX_RANGE_DAYS} 天）")
        days = [start + timedelta(days=offset) for offset in range((end - start).days + 1)]
    elif args.date:
        days = [_parse_day(args.date, "--date")]
    else:
        days = [date_cls.today()]

    repos = args.repo or list(DEFAULT_REPOS)
    scan_dirs = args.dir or list(DEFAULT_SCAN_DIRS)
    out_dir = Path(args.out)
    for day in days:
        evidence = build_evidence(
            day,
            zcode_db_path=args.zcode_db,
            zcode_log_dir=args.zcode_log_dir,
            repos=repos,
            scan_dirs=scan_dirs,
        )
        path = write_evidence(evidence, out_dir)
        print(f"{day.isoformat()}: {_source_counts(evidence)} -> {path}")
    return 0


def _parse_timestamp(raw: Any) -> datetime | None:
    if not isinstance(raw, str) or not raw:
        return None
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return None


if __name__ == "__main__":
    sys.exit(main())
