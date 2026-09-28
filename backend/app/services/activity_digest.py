"""活动证据 → 候选活动记录（F-045 记录层第一期）。

规则聚合是确定性主干：同输入同输出、不依赖网络与 LLM，pytest 覆盖。
LLM 只做可选的「文案归纳」层——候选的结构、时间窗与 dedup_key 全部来自
规则结果，LLM 仅改写 summary 与建议类目；任何失败（未配 Key/超时/连接
失败/输出畸形）都回退规则结果，不丢已采集的证据。
"""

from __future__ import annotations

import hashlib
import json
import logging
import re
import time
from collections import Counter
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

import httpx

from app.activity_collector import SESSION_IDLE_GAP
from app.config import Settings
from app.logging_setup import get_logger, log_event
from app.schemas import (
    ActivityCandidate,
    ActivityDigestRequest,
    ActivityDigestResponse,
    ActivityEvidence,
    ActivityFileChange,
    ActivityGitSource,
    ActivitySessionEvidence,
    ActivityZcodeSource,
)
from app.services.ai import (
    _extract_content,
    call_chat_completions,
    parse_model_json,
    resolve_ai_provider,
)
from app.services.nlp import guess_category

logger = get_logger(__name__)

# 相邻活动段间隔不超过该值时合并为一个候选（回消息、接水不切断记录）。
# 与采集层切段阈值同尺（SESSION_IDLE_GAP，15 分钟）：必须 ≤ 切段阈值，
# 否则刚被空闲切开的段会在这里被重新缝合。
SESSION_MERGE_GAP = SESSION_IDLE_GAP
SUMMARY_SUBJECT_LIMIT = 3
SUBJECT_MAX_CHARS = 40
EVIDENCE_MAX_CHARS = 200
MAX_AI_FILES = 5
ALLOWED_CATEGORIES = {"work", "study", "fitness", "life", "rest"}

# 求职类补充词：解析链路硬规则「投简历/求职/面试 → work」在活动素材上的延伸。
# nlp 通用词表只含「投简历/投递简历/求职/面试」整词形态，而会话标题/文件名
# 常出现「简历/岗位/投递」等变体（如「更新 AI 定向简历」）。
ACTIVITY_WORK_PATTERN = re.compile(r"简历|岗位|面试|求职|投递|应聘|猎头|offer", re.I)


def refine_category(base: str, *texts: str) -> str:
    """复用解析链路的本地归类（nlp.guess_category）+ 活动求职词补充。

    默认沿用 base（活动默认 work）；素材出现明确的其他类目信号时才让位——
    life 视为「无信号」不覆盖，避免把改简历、写代码误判成日常起居。
    """
    combined = " ".join(text for text in texts if text)
    if ACTIVITY_WORK_PATTERN.search(combined):
        return "work"
    guessed = guess_category(combined)
    return guessed if guessed != "life" else base


@dataclass
class _Member:
    """跨来源归并成员：candidate 为主结构，其余字段供合并摘要重建。"""

    candidate: ActivityCandidate
    start: datetime | None
    end: datetime | None
    # zcode 来源：会话标识与内容信号
    session_ids: tuple[str, ...] = ()
    titles: tuple[str, ...] = ()
    projects: tuple[str, ...] = ()
    files_edited: tuple[str, ...] = ()
    commands: tuple[str, ...] = ()
    # git 来源
    repo_name: str = ""
    commit_count: int = 0
    # files 来源
    file_dir: str = ""
    file_paths: tuple[str, ...] = ()


def build_rule_candidates(evidence: ActivityEvidence) -> list[ActivityCandidate]:
    """规则聚合：证据 → 候选记录，按开始时间排序（无时间窗的排最后）。

    同一时间段的跨来源痕迹（会话/文件变动/提交）合并为一条——
    用户口径：同一件事不该按来源拆成多条记录。
    """
    day = evidence.date
    members = [
        *_zcode_members(day, evidence.sources.zcode),
        *_git_members(day, evidence.sources.git),
        *_files_members(day, evidence.sources.files),
    ]
    return _merge_same_period(day, members)


def _candidate_order(candidate: ActivityCandidate) -> tuple[int, int, int]:
    start = candidate.start if candidate.start is not None else 1441
    return (0 if candidate.start is not None else 1, start, candidate.end or 0)


def _session_intervals(
    session: ActivitySessionEvidence,
) -> list[tuple[datetime, datetime]]:
    """会话参与归并的间隔列表：segments 优先（修订 5 切段结果），
    缺失或全部畸形时回退 start/end 整段窗口（旧证据文件兼容）。"""
    intervals: list[tuple[datetime, datetime]] = []
    for segment in session.segments:
        start = _parse_local(segment.start)
        if start is None:
            continue
        intervals.append((start, _parse_local(segment.end) or start))
    if intervals:
        intervals.sort(key=lambda item: item[0])
        return intervals
    start = _parse_local(session.start)
    if start is None:
        return []
    return [(start, _parse_local(session.end) or start)]


def _zcode_members(
    day: str, source: ActivityZcodeSource | None
) -> list[_Member]:
    if source is None or not source.sessions:
        return []
    timed: list[tuple[datetime, datetime, ActivitySessionEvidence]] = []
    for session in source.sessions:
        for start, end in _session_intervals(session):
            timed.append((start, end, session))
    timed.sort(key=lambda item: item[0])

    groups: list[list[tuple[datetime, datetime, ActivitySessionEvidence]]] = []
    envelope_ends: list[datetime] = []
    for start, end, session in timed:
        # 锚点取组内包络终点：嵌套/重叠段不收缩合并窗口
        if groups and start - envelope_ends[-1] <= SESSION_MERGE_GAP:
            groups[-1].append((start, end, session))
            envelope_ends[-1] = max(envelope_ends[-1], end)
        else:
            groups.append([(start, end, session)])
            envelope_ends.append(end)

    members: list[_Member] = []
    for group in groups:
        group_start = min(item[0] for item in group)
        group_end = max(item[1] for item in group)
        start_minutes = _minutes_of_day(group_start)
        end_minutes = _minutes_of_day(group_end)
        # 段级合并后同一会话可能贡献多个间隔：口径按去重后的会话统计
        distinct_sessions: list[ActivitySessionEvidence] = []
        seen_ids: set[str] = set()
        for _, _, session in group:
            if session.session_id in seen_ids:
                continue
            seen_ids.add(session.session_id)
            distinct_sessions.append(session)
        session_count = len(distinct_sessions)
        tool_calls = sum(session.tool_calls for session in distinct_sessions)
        tool_counter: Counter[str] = Counter()
        titles: list[str] = []
        projects: list[str] = []
        files_edited: list[str] = []
        commands: list[str] = []
        for session in distinct_sessions:
            for tool in session.top_tools:
                tool_counter[tool.name] += tool.count
            if session.title and session.title not in titles:
                titles.append(session.title)
            project = Path(session.directory).name if session.directory else ""
            if project and project not in projects:
                projects.append(project)
            for file_path in session.files_edited:
                if file_path not in files_edited:
                    files_edited.append(file_path)
            for command in session.commands:
                if command not in commands:
                    commands.append(command)
        top_tools = [name for name, _ in tool_counter.most_common(3)]

        span = _format_span(start_minutes, end_minutes)
        if session_count == 1 and titles:
            head = f"「{titles[0]}」（{projects[0]}，{span}）" if projects else f"「{titles[0]}」（{span}）"
        elif titles:
            head = f"「{titles[0]}」等 {session_count} 个会话（{span}）"
        elif session_count > 1:
            head = f"ZCode 会话 ×{session_count}（{span}）"
        else:
            head = f"ZCode 会话（{span}）"

        details = []
        if titles:
            if files_edited:
                details.append(f"改 {len(files_edited)} 个文件")
        else:
            if tool_calls:
                details.append(f"{tool_calls} 次工具调用")
            if top_tools:
                details.append(f"主要用 {'、'.join(top_tools)}")
        summary = f"{head}：{'，'.join(details)}" if details else head

        evidence_parts = []
        if titles:
            evidence_parts.append(f"标题：{'、'.join(titles[:2])}")
        if files_edited:
            evidence_parts.append(
                "文件：" + "、".join(Path(path).name for path in files_edited[:5])
            )
        if commands:
            evidence_parts.append("命令：" + "、".join(commands[:3]))

        candidate = ActivityCandidate(
            # 指纹含时间窗分钟数：同一会话拆出的多段各得一键，不会互相去重
            dedup_key="zcode:"
            + _fingerprint(
                day, *sorted(seen_ids), str(start_minutes), str(end_minutes)
            ),
            date=day,
            start=start_minutes,
            end=end_minutes,
            summary=summary,
            category=refine_category("work", *titles, *files_edited),
            sources=["zcode"],
            evidence=(
                "；".join(evidence_parts)
                or (
                    f"{session_count} 个会话；工具调用 Top："
                    + "、".join(f"{name}×{count}" for name, count in tool_counter.most_common(3))
                    if tool_counter
                    else f"{session_count} 个会话"
                )
            )[:EVIDENCE_MAX_CHARS],
            titles=titles[:3],
            files_edited=files_edited[:MAX_AI_FILES],
        )
        members.append(
            _Member(
                candidate=candidate,
                start=group_start,
                end=group_end,
                session_ids=tuple(sorted(seen_ids)),
                titles=tuple(titles),
                projects=tuple(projects),
                files_edited=tuple(files_edited),
                commands=tuple(commands),
            )
        )
    return members


def _git_members(
    day: str, source: ActivityGitSource | None
) -> list[_Member]:
    if source is None:
        return []
    members: list[_Member] = []
    for repo in source.repos:
        if not repo.commits:
            continue
        repo_name = repo.name or Path(repo.path).name or repo.path
        # 提交按时间空闲切段：散布全天的提交包络不再桥接多个时段（修订 7）
        timed = sorted(
            (
                (parsed, commit)
                for commit in repo.commits
                if (parsed := _parse_local(commit.time)) is not None
            ),
            key=lambda item: item[0],
        )
        unparsed = [
            commit for commit in repo.commits if _parse_local(commit.time) is None
        ]
        bursts: list[list[tuple[datetime | None, ActivityGitCommit]]] = []
        last_ts: datetime | None = None
        for parsed, commit in timed:
            if not bursts or parsed - last_ts > SESSION_MERGE_GAP:
                bursts.append([])
            bursts[-1].append((parsed, commit))
            last_ts = parsed
        if unparsed:
            if not bursts:
                bursts.append([])
            bursts[0].extend((None, commit) for commit in unparsed)
        for burst in bursts:
            burst_parsed = [ts for ts, _ in burst if ts is not None]
            burst_commits = [commit for _, commit in burst]
            subjects = [
                commit.subject.strip()
                for commit in burst_commits
                if commit.subject.strip()
            ]
            summary = f"仓库「{repo_name}」提交 {len(burst_commits)} 次"
            if subjects:
                preview = "；".join(
                    subject[:SUBJECT_MAX_CHARS] for subject in subjects[:SUMMARY_SUBJECT_LIMIT]
                )
                summary = f"{summary}：{preview}"
            candidate = ActivityCandidate(
                dedup_key="git:"
                + _fingerprint(repo.path, *sorted(commit.hash for commit in burst_commits)),
                date=day,
                start=_minutes_of_day(min(burst_parsed)) if burst_parsed else None,
                end=_minutes_of_day(max(burst_parsed)) if burst_parsed else None,
                summary=summary,
                category=refine_category("work", *subjects),
                sources=["git"],
                evidence="；".join(subjects)[:EVIDENCE_MAX_CHARS] or None,
            )
            members.append(
                _Member(
                    candidate=candidate,
                    start=min(burst_parsed) if burst_parsed else None,
                    end=max(burst_parsed) if burst_parsed else None,
                    repo_name=repo_name,
                    commit_count=len(burst_commits),
                )
            )
    return members


def _files_members(day: str, source: Any | None) -> list[_Member]:
    if source is None or not source.files:
        return []
    changes_by_dir: dict[str, list[ActivityFileChange]] = {}
    for change in source.files:
        parent = str(Path(change.path).parent)
        changes_by_dir.setdefault(parent, []).append(change)

    members: list[_Member] = []
    for parent in sorted(changes_by_dir):
        changes = changes_by_dir[parent]
        display_dir = "/".join(Path(parent).parts[-2:]) or parent
        # 变动按 mtime 空闲切段：目录包络（最早/最晚 mtime）不再桥接全天（修订 7）
        timed = sorted(
            (
                (parsed, change)
                for change in changes
                if (parsed := _parse_local(change.mtime)) is not None
            ),
            key=lambda item: item[0],
        )
        unparsed = [
            change for change in changes if _parse_local(change.mtime) is None
        ]
        bursts: list[list[tuple[datetime | None, ActivityFileChange]]] = []
        last_ts: datetime | None = None
        for parsed, change in timed:
            if not bursts or parsed - last_ts > SESSION_MERGE_GAP:
                bursts.append([])
            bursts[-1].append((parsed, change))
            last_ts = parsed
        if unparsed:
            if not bursts:
                bursts.append([])
            bursts[0].extend((None, change) for change in unparsed)
        for burst in bursts:
            burst_parsed = [ts for ts, _ in burst if ts is not None]
            burst_changes = [change for _, change in burst]
            names = [Path(change.path).name for change in burst_changes[:3]]
            summary = f"更新 {len(burst_changes)} 个文件（{display_dir}）"
            if names:
                summary = f"{summary}：{'、'.join(names)}"
            evidence_names = [Path(change.path).name for change in burst_changes[:10]]
            candidate = ActivityCandidate(
                dedup_key="files:"
                + _fingerprint(day, parent, *sorted(change.path for change in burst_changes)),
                date=day,
                start=_minutes_of_day(min(burst_parsed)) if burst_parsed else None,
                end=_minutes_of_day(max(burst_parsed)) if burst_parsed else None,
                summary=summary,
                category=refine_category(
                    "work", *(Path(change.path).name for change in burst_changes)
                ),
                sources=["files"],
                evidence=(
                    "、".join(evidence_names) + ("等" if len(burst_changes) > 10 else "")
                )[:EVIDENCE_MAX_CHARS],
            )
            members.append(
                _Member(
                    candidate=candidate,
                    start=min(burst_parsed) if burst_parsed else None,
                    end=max(burst_parsed) if burst_parsed else None,
                    file_dir=display_dir,
                    file_paths=tuple(change.path for change in burst_changes),
                )
            )
    return members


def _merge_same_period(day: str, members: list[_Member]) -> list[ActivityCandidate]:
    """跨来源归并：窗口重叠或间隔 ≤ SESSION_MERGE_GAP 的成员合并为一条。

    与会话段缝合同一把尺（修订 6）：同一时段的工作不按来源拆成多条记录；
    无时间窗的候选不参与、保持原样。
    """
    timed = [
        member
        for member in members
        if member.start is not None and member.end is not None
    ]
    untimed = [
        member.candidate
        for member in members
        if member.start is None or member.end is None
    ]
    timed.sort(key=lambda member: member.start)

    groups: list[list[_Member]] = []
    envelope_ends: list[datetime] = []
    for member in timed:
        if groups and member.start - envelope_ends[-1] <= SESSION_MERGE_GAP:
            groups[-1].append(member)
            envelope_ends[-1] = max(envelope_ends[-1], member.end)
        else:
            groups.append([member])
            envelope_ends.append(member.end)

    merged = [
        group[0].candidate if len(group) == 1 else _merged_candidate(day, group)
        for group in groups
    ]
    merged.extend(untimed)
    merged.sort(key=_candidate_order)
    return merged


def _merged_candidate(day: str, group: list[_Member]) -> ActivityCandidate:
    start = min(member.start for member in group)
    end = max(member.end for member in group)
    start_minutes = _minutes_of_day(start)
    end_minutes = _minutes_of_day(end)
    span = _format_span(start_minutes, end_minutes)

    titles: list[str] = []
    projects: list[str] = []
    files_edited: list[str] = []
    commands: list[str] = []
    session_ids: set[str] = set()
    for member in group:
        session_ids.update(member.session_ids)
        for pool, values in (
            (titles, member.titles),
            (projects, member.projects),
            (files_edited, member.files_edited),
            (commands, member.commands),
        ):
            for value in values:
                if value not in pool:
                    pool.append(value)

    # files 来源按目录聚合剩余文件数（同名文件已剔除，跨段/跨目录不双报）；
    # git 提交按仓库聚合次数
    known_names = {Path(path).name for path in files_edited}
    remaining_by_dir: dict[str, list[str]] = {}
    repo_counts: Counter[str] = Counter()
    for member in group:
        if member.file_dir:
            remaining = [
                path for path in member.file_paths if Path(path).name not in known_names
            ]
            if remaining:
                remaining_by_dir.setdefault(member.file_dir, []).extend(remaining)
        elif member.commit_count:
            repo_counts[member.repo_name or "仓库"] += member.commit_count
    extras = [
        *(f"更新 {len(paths)} 个文件（{directory}）" for directory, paths in sorted(remaining_by_dir.items())),
        *(f"「{name}」提交 {count} 次" for name, count in sorted(repo_counts.items())),
    ]

    if titles:
        session_count = len(session_ids)
        if session_count <= 1 and projects:
            head = f"「{titles[0]}」（{projects[0]}，{span}）"
        elif session_count <= 1:
            head = f"「{titles[0]}」（{span}）"
        else:
            head = f"「{titles[0]}」等 {session_count} 个会话（{span}）"
        body = f"{head}：改 {len(files_edited)} 个文件" if files_edited else head
        summary = "；".join([body, *extras])
    else:
        summary = "；".join(
            member.candidate.summary for member in group if member.candidate.summary
        )

    # AI 材料并集：会话编辑文件 + 文件来源路径，AI 归纳据此写一条总结
    ai_files = list(files_edited)
    for member in group:
        if member.file_dir:
            for path in member.file_paths:
                if path not in ai_files:
                    ai_files.append(path)

    evidence_text = "；".join(
        text for text in (member.candidate.evidence for member in group) if text
    )[:EVIDENCE_MAX_CHARS]

    return ActivityCandidate(
        dedup_key="merged:"
        + _fingerprint(day, *sorted(member.candidate.dedup_key for member in group)),
        date=day,
        start=start_minutes,
        end=end_minutes,
        summary=summary,
        category=refine_category("work", *titles, *ai_files),
        sources=[
            source
            for source in ("zcode", "git", "files")
            if any(source in member.candidate.sources for member in group)
        ],
        evidence=evidence_text or None,
        titles=titles[:3],
        files_edited=ai_files[:MAX_AI_FILES],
    )


def _build_digest_prompt() -> str:
    # 分类决策优先级移植自解析链路（ai.py build_system_prompt）：
    # 活动素材里的「改简历/岗位研究/查询目标公司」等求职信号必须归 work，
    # 不能因语境像生活琐事而误判（用户实测反馈）。
    return "\n".join(
        [
            "你是日程记录助手，把候选活动整理成简短的中文描述，只输出 JSON。",
            '格式:{"items":[{"dedup_key":"原样返回","summary":"不超过30字","category":"work|study|fitness|life|rest"}]}',
            "items 里 titles 是编码会话标题、files 是编辑过的文件名：",
            "summary 结合这些写清楚具体做了什么（如「修复活动导入去重逻辑」），",
            "不要罗列工具名或调用次数，不得编造 titles/files 里没有的信息；",
            "category 按以下决策优先级判定（由高到低）：",
            "1. 涉及赚钱、职业发展、工作任务、求职面试、客户沟通 → work"
            "（投简历、改简历、岗位研究、面试准备、查询目标公司/股东背景均属求职，归 work）",
            "2. 涉及学习、技能提升、备考、阅读知识类内容、研究 → study",
            "3. 涉及身体锻炼、运动、健身、康复 → fitness",
            "4. 涉及日常起居、通勤、家务、购物、社交聚会 → life",
            "5. 涉及休息、放松、冥想、无产出活动 → rest",
            "6. 无法明确覆盖时按上下文语义取最合理者，绝不拒识；",
            "dedup_key 必须原样返回，不得增减条目。",
        ]
    )


def _apply_ai_polish(
    candidates: list[ActivityCandidate], payload: Any
) -> list[ActivityCandidate]:
    """把 LLM 归纳结果套回规则候选：只接受已知 dedup_key 与合法类目，漏掉的保留原文。"""
    if not isinstance(payload, dict):
        raise ValueError("AI 未返回 JSON 对象")
    items = payload.get("items")
    if not isinstance(items, list):
        raise ValueError("AI 未返回 items 列表")
    by_key = {candidate.dedup_key: candidate for candidate in candidates}
    seen: set[str] = set()
    polished: list[ActivityCandidate] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        key = item.get("dedup_key")
        base = by_key.get(key) if isinstance(key, str) else None
        if base is None or key in seen:
            continue
        seen.add(key)
        summary = item.get("summary")
        category = item.get("category")
        polished.append(
            base.model_copy(
                update={
                    "summary": (
                        summary.strip()[:60]
                        if isinstance(summary, str) and summary.strip()
                        else base.summary
                    ),
                    "category": category if category in ALLOWED_CATEGORIES else base.category,
                }
            )
        )
    polished.extend(candidate for candidate in candidates if candidate.dedup_key not in seen)
    polished.sort(key=_candidate_order)
    return polished


async def digest_activities(
    payload: ActivityDigestRequest,
    provider: str | None,
    settings: Settings,
    api_key: str | None = None,
) -> ActivityDigestResponse:
    evidence = payload.evidence
    started = time.perf_counter()
    log_event(logger, logging.INFO, "activity_digest.start", evidence_date=evidence.date)
    candidates = build_rule_candidates(evidence)
    if not candidates:
        _log_result(started, source="local", used_ai=False, count=0, reason="empty_evidence")
        return ActivityDigestResponse(
            source="local", used_ai=False, candidates=[], message="证据里没有可识别的活动"
        )

    resolved_provider, fallback_message = resolve_ai_provider(provider, settings, api_key)
    if not resolved_provider or not payload.use_ai:
        reason = "no_ai_configured" if not resolved_provider else "ai_disabled"
        _log_result(started, source="local", used_ai=False, count=len(candidates), reason=reason)
        return ActivityDigestResponse(
            source="local", used_ai=False, candidates=candidates, message=fallback_message
        )

    try:
        items = [
            {
                "dedup_key": candidate.dedup_key,
                "raw": candidate.summary,
                "time": _format_span(candidate.start, candidate.end),
                **(
                    {
                        "titles": candidate.titles,
                        "files": [
                            Path(path).name for path in candidate.files_edited[:MAX_AI_FILES]
                        ],
                    }
                    if candidate.titles or candidate.files_edited
                    else {}
                ),
            }
            for candidate in candidates
        ]
        user_text = json.dumps({"date": evidence.date, "items": items}, ensure_ascii=False)
        data = await call_chat_completions(
            _build_digest_prompt(),
            user_text,
            resolved_provider,
            settings,
            operation="activity_digest",
            credential=api_key,
        )
        polished = _apply_ai_polish(candidates, parse_model_json(_extract_content(data)))
        _log_result(started, source=resolved_provider, used_ai=True, count=len(polished))
        return ActivityDigestResponse(source=resolved_provider, used_ai=True, candidates=polished)
    except httpx.ConnectError:
        return _ai_fallback(started, candidates, "无法连接 AI 服务，已使用规则归纳", "ai_connect_error")
    except httpx.TimeoutException:
        seconds = round(settings.ai_timeout_ms / 1000)
        return _ai_fallback(
            started, candidates, f"AI 归纳超时（{seconds} 秒），已使用规则归纳", f"ai_timeout:{seconds}s"
        )
    except Exception as error:
        return _ai_fallback(
            started, candidates, f"AI 归纳失败，已使用规则归纳：{str(error)[:100]}", str(error)[:200]
        )


def _ai_fallback(
    started: float, candidates: list[ActivityCandidate], message: str, error: str
) -> ActivityDigestResponse:
    log_event(
        logger,
        logging.WARNING,
        "activity_digest.ai_fallback",
        error=error,
        candidates=len(candidates),
    )
    _log_result(started, source="local", used_ai=False, count=len(candidates), reason="ai_fallback")
    return ActivityDigestResponse(source="local", used_ai=False, candidates=candidates, message=message)


def _log_result(
    started: float, source: str, used_ai: bool, count: int, reason: str | None = None
) -> None:
    log_event(
        logger,
        logging.INFO,
        "activity_digest.result",
        source=source,
        used_ai=used_ai,
        candidates=count,
        duration_ms=round((time.perf_counter() - started) * 1000, 2),
        reason=reason,
    )


def _parse_local(raw: str | None) -> datetime | None:
    if not isinstance(raw, str) or not raw:
        return None
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00")).astimezone()
    except ValueError:
        return None


def _minutes_of_day(value: datetime) -> int:
    return max(0, min(1440, value.hour * 60 + value.minute))


def _format_span(start: int | None, end: int | None) -> str:
    if start is None or end is None:
        return "时间未知"
    return f"{start // 60:02d}:{start % 60:02d}–{end // 60:02d}:{end % 60:02d}"


def _fingerprint(*parts: str) -> str:
    return hashlib.sha1("|".join(parts).encode("utf-8")).hexdigest()[:16]
