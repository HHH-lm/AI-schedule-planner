"""活动证据归纳（F-045）回归测试：规则聚合确定性、LLM 归纳层回退、路由校验。

规则聚合路径零网络零 LLM；AI 路径 monkeypatch call_chat_completions，
覆盖成功/超时/畸形输出三种形态。外部 HTTP 全部不触网。
"""

from __future__ import annotations

import asyncio
from datetime import date, datetime
from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient

from app.services import activity_digest
from app.config import Settings, get_settings
from app.limiter import limiter as route_limiter
from app.main import app
from app.schemas import ActivityCandidate, ActivityDigestRequest, ActivityDigestResponse, ActivityEvidence

DAY = date(2026, 9, 27)


def local_iso(hour: int, minute: int = 0) -> str:
    """构造本机时区的当日时间串：断言用的分钟数在任何时区都成立。"""
    return datetime(2026, 9, 27, hour, minute).astimezone().isoformat(timespec="seconds")


def make_evidence(**overrides: Any) -> dict[str, Any]:
    """构造标准证据 JSON：两个相邻 ZCode 会话、一次 git 提交、两个文件变动。"""
    base: dict[str, Any] = {
        "schema": "activity-evidence/1",
        "date": "2026-09-27",
        "generated_at": local_iso(21, 0),
        "sources": {
            "zcode": {
                "available": True,
                "note": None,
                "sessions": [
                    {
                        "session_id": "s1",
                        "start": local_iso(9, 0),
                        "end": local_iso(9, 50),
                        "tool_calls": 5,
                        "top_tools": [{"name": "Bash", "count": 5}],
                    },
                    {
                        "session_id": "s2",
                        "start": local_iso(10, 0),
                        "end": local_iso(10, 30),
                        "tool_calls": 3,
                        "top_tools": [{"name": "Read", "count": 3}],
                    },
                ],
            },
            "git": {
                "available": True,
                "note": None,
                "repos": [
                    {
                        "path": "/Users/h/Documents/AI/demo",
                        "name": "demo",
                        "commits": [
                            {
                                "hash": "h1",
                                "time": local_iso(11, 0),
                                "subject": "feat: 新功能",
                            }
                        ],
                    }
                ],
            },
            "files": {
                "available": True,
                "note": None,
                "truncated": False,
                "files": [
                    {"path": "/Users/h/Documents/AI/demo/src/a.py", "mtime": local_iso(11, 30)},
                    {"path": "/Users/h/Documents/AI/demo/src/b.py", "mtime": local_iso(11, 40)},
                ],
            },
        },
    }
    for key, value in overrides.items():
        if key == "sources":
            base["sources"].update(value)
        else:
            base[key] = value
    return base


def _rule_candidates(evidence_dict: dict[str, Any]) -> list[ActivityCandidate]:
    return activity_digest.build_rule_candidates(ActivityEvidence.model_validate(evidence_dict))


class TestRuleCandidates:
    def test_merges_adjacent_sessions_within_gap(self) -> None:
        candidates = _rule_candidates(make_evidence())
        zcode = [c for c in candidates if "zcode" in c.sources]
        # 09:00-09:50 与 10:00-10:30 间隔 10 分钟（≤15）→ 合并为一个候选
        # （两会话均无 segments：旧证据文件回退整段 start/end 窗口）
        assert len(zcode) == 1
        assert zcode[0].start == 540 and zcode[0].end == 630
        assert "×2" in zcode[0].summary and "8 次工具调用" in zcode[0].summary
        assert zcode[0].dedup_key.startswith("zcode:")

    def test_far_apart_sessions_stay_separate(self) -> None:
        evidence = make_evidence(
            sources={
                "zcode": {
                    "available": True,
                    "note": None,
                    "sessions": [
                        {
                            "session_id": "s1",
                            "start": local_iso(9, 0),
                            "end": local_iso(9, 50),
                            "tool_calls": 2,
                            "top_tools": [],
                        },
                        {
                            "session_id": "s2",
                            "start": local_iso(10, 31),
                            "end": local_iso(11, 0),
                            "tool_calls": 1,
                            "top_tools": [],
                        },
                    ],
                }
            }
        )
        candidates = _rule_candidates(evidence)
        zcode = [c for c in candidates if "zcode" in c.sources]
        assert len(zcode) == 2

    def test_session_segments_become_separate_candidates(self) -> None:
        evidence = make_evidence(
            sources={
                "zcode": {
                    "available": True,
                    "note": None,
                    "sessions": [
                        {
                            "session_id": "s1",
                            "title": "深夜加早段的会话",
                            "start": local_iso(0, 44),
                            "end": local_iso(15, 15),
                            "tool_calls": 42,
                            "top_tools": [],
                            "segments": [
                                {"start": local_iso(0, 44), "end": local_iso(0, 57)},
                                {"start": local_iso(15, 5), "end": local_iso(15, 15)},
                            ],
                        }
                    ],
                }
            }
        )
        zcode = [c for c in _rule_candidates(evidence) if "zcode" in c.sources]
        assert len(zcode) == 2
        assert (zcode[0].start, zcode[0].end) == (44, 57)
        assert (zcode[1].start, zcode[1].end) == (905, 915)
        # 同一会话拆出的多段各得一键（指纹含时间窗），不会互相去重
        assert zcode[0].dedup_key != zcode[1].dedup_key
        # 同输入指纹稳定：重复采集/导入不产生新键
        again = [c for c in _rule_candidates(evidence) if "zcode" in c.sources]
        assert [c.dedup_key for c in again] == [c.dedup_key for c in zcode]
        # 单会话模板携带各自的时间段
        assert "00:44–00:57" in zcode[0].summary
        assert "15:05–15:15" in zcode[1].summary
        assert zcode[0].titles == ["深夜加早段的会话"]

    def test_segments_merge_across_sessions_with_envelope_end(self) -> None:
        # 复刻 9/22 实测形态：早段结束后 4 分钟开新会话（≤15 分钟合并），
        # 第三个会话开始早于第二个的结束（嵌套）——合并窗取包络而非末位会话终点
        evidence = make_evidence(
            sources={
                "zcode": {
                    "available": True,
                    "note": None,
                    "sessions": [
                        {
                            "session_id": "s1",
                            "title": "查找引导修改简历的技能包",
                            "start": local_iso(15, 5),
                            "end": local_iso(15, 15),
                            "tool_calls": 2,
                            "top_tools": [],
                        },
                        {
                            "session_id": "s2",
                            "title": "简历 AI 相关内容人性化改写",
                            "start": local_iso(15, 19),
                            "end": local_iso(17, 58),
                            "tool_calls": 203,
                            "top_tools": [],
                        },
                        {
                            "session_id": "s3",
                            "title": "用 humanizer 优化 Boss 直聘 HR 回复",
                            "start": local_iso(17, 17),
                            "end": local_iso(17, 18),
                            "tool_calls": 8,
                            "top_tools": [],
                        },
                    ],
                }
            }
        )
        zcode = [c for c in _rule_candidates(evidence) if "zcode" in c.sources]
        assert len(zcode) == 1
        # 15:05 → 17:58 包络（旧实现取末位会话终点 17:18，截丢 40 分钟）
        assert (zcode[0].start, zcode[0].end) == (905, 1078)
        assert "等 3 个会话" in zcode[0].summary
        assert "15:05–17:58" in zcode[0].summary

    def test_malformed_segments_fall_back_to_session_window(self) -> None:
        evidence = make_evidence(
            sources={
                "zcode": {
                    "available": True,
                    "note": None,
                    "sessions": [
                        {
                            "session_id": "s1",
                            "start": local_iso(9, 0),
                            "end": local_iso(9, 50),
                            "tool_calls": 3,
                            "top_tools": [],
                            "segments": [{"start": "not-a-date", "end": "not-a-date"}],
                        }
                    ],
                }
            }
        )
        zcode = [c for c in _rule_candidates(evidence) if "zcode" in c.sources]
        assert len(zcode) == 1
        assert (zcode[0].start, zcode[0].end) == (540, 590)

    def test_overlapping_sources_merge_into_one_candidate(self) -> None:
        # 同一时间段：zcode 会话 + files 文件变动 → 合并一条（修订 6 用户口径）
        evidence = make_evidence(
            sources={
                "zcode": {
                    "available": True,
                    "note": None,
                    "sessions": [
                        {
                            "session_id": "s1",
                            "title": "简历 AI 相关内容人性化改写",
                            "directory": "/Users/h/Documents/AI/求职",
                            "start": local_iso(16, 35),
                            "end": local_iso(17, 58),
                            "tool_calls": 200,
                            "top_tools": [],
                            "files_edited": ["/Users/h/Documents/AI/求职/面试-速查-飞书基础.txt"],
                        }
                    ],
                },
                "git": {"available": True, "note": None, "repos": []},
                "files": {
                    "available": True,
                    "note": None,
                    "truncated": False,
                    "files": [
                        {"path": "/Users/h/Documents/AI/求职/面试-速查-飞书基础.txt", "mtime": local_iso(16, 40)},
                        {"path": "/Users/h/Documents/AI/求职/面试-回复-AI是自学还是培训.txt", "mtime": local_iso(17, 10)},
                    ],
                },
            }
        )
        candidates = _rule_candidates(evidence)
        assert len(candidates) == 1
        merged = candidates[0]
        assert merged.sources == ["zcode", "files"]
        assert (merged.start, merged.end) == (995, 1078)
        assert merged.dedup_key.startswith("merged:")
        # 摘要含会话头 + 文件变动段；同名文件不双报（2 个变动文件 1 个已计入会话）
        assert "「简历 AI 相关内容人性化改写」" in merged.summary
        assert "16:35–17:58" in merged.summary
        assert "更新 1 个文件" in merged.summary
        # AI 材料并集带 files 来源的文件名
        assert any("面试-回复" in path for path in merged.files_edited)

    def test_git_commit_overlapping_session_merges(self) -> None:
        evidence = make_evidence(
            sources={
                "zcode": {
                    "available": True,
                    "note": None,
                    "sessions": [
                        {
                            "session_id": "s1",
                            "title": "修复活动导入去重",
                            "start": local_iso(9, 0),
                            "end": local_iso(9, 50),
                            "tool_calls": 12,
                            "top_tools": [],
                        }
                    ],
                },
                "git": {
                    "available": True,
                    "note": None,
                    "repos": [
                        {
                            "path": "/Users/h/Documents/AI/demo",
                            "name": "demo",
                            "commits": [{"hash": "h1", "time": local_iso(9, 40), "subject": "feat: x"}],
                        }
                    ],
                },
                "files": {"available": True, "note": None, "truncated": False, "files": []},
            }
        )
        candidates = _rule_candidates(evidence)
        assert len(candidates) == 1
        merged = candidates[0]
        assert merged.sources == ["zcode", "git"]
        assert (merged.start, merged.end) == (540, 590)
        assert "「修复活动导入去重」" in merged.summary
        assert "「demo」提交 1 次" in merged.summary

    def test_sources_thirty_minutes_apart_stay_separate(self) -> None:
        # 默认证据 zcode(540-630)/git(660)/files(690) 间隔 30 分钟 → 不合并（回归守卫）
        candidates = _rule_candidates(make_evidence())
        assert [c.sources[0] for c in candidates] == ["zcode", "git", "files"]
        assert all(not c.dedup_key.startswith("merged:") for c in candidates)

    def test_files_changes_split_by_idle_gap(self) -> None:
        # 同目录文件变动按 mtime 空闲切段：目录包络不再桥接全天（修订 7）
        evidence = make_evidence(
            sources={
                "zcode": {"available": True, "note": None, "sessions": []},
                "git": {"available": True, "note": None, "repos": []},
                "files": {
                    "available": True,
                    "note": None,
                    "truncated": False,
                    "files": [
                        {"path": "/p/demo/src/a.py", "mtime": local_iso(10, 0)},
                        {"path": "/p/demo/src/b.py", "mtime": local_iso(10, 5)},
                        {"path": "/p/demo/src/c.py", "mtime": local_iso(12, 0)},
                    ],
                },
            }
        )
        files = [c for c in _rule_candidates(evidence) if "files" in c.sources]
        assert len(files) == 2
        assert (files[0].start, files[0].end) == (600, 605)
        assert (files[1].start, files[1].end) == (720, 720)
        assert "更新 2 个文件" in files[0].summary
        assert "更新 1 个文件" in files[1].summary
        assert files[0].dedup_key != files[1].dedup_key

    def test_git_commits_split_by_idle_gap(self) -> None:
        # 散布全天的提交按时间空闲切段，不再整包络成一条（修订 7）
        evidence = make_evidence(
            sources={
                "zcode": {"available": True, "note": None, "sessions": []},
                "git": {
                    "available": True,
                    "note": None,
                    "repos": [
                        {
                            "path": "/Users/h/Documents/AI/demo",
                            "name": "demo",
                            "commits": [
                                {"hash": "h1", "time": local_iso(10, 0), "subject": "feat: a"},
                                {"hash": "h2", "time": local_iso(10, 10), "subject": "fix: b"},
                                {"hash": "h3", "time": local_iso(16, 0), "subject": "feat: c"},
                            ],
                        }
                    ],
                },
                "files": {"available": True, "note": None, "truncated": False, "files": []},
            }
        )
        git = [c for c in _rule_candidates(evidence) if "git" in c.sources]
        assert len(git) == 2
        assert (git[0].start, git[0].end) == (600, 610)
        assert (git[1].start, git[1].end) == (960, 960)
        assert "提交 2 次" in git[0].summary and "提交 1 次" in git[1].summary
        assert git[0].dedup_key != git[1].dedup_key

    def test_git_candidate_summary_and_stable_dedup(self) -> None:
        first = _rule_candidates(make_evidence())
        again = _rule_candidates(make_evidence())
        git_first = [c for c in first if "git" in c.sources][0]
        git_again = [c for c in again if "git" in c.sources][0]
        assert "仓库「demo」提交 1 次" in git_first.summary
        assert "feat: 新功能" in git_first.summary
        assert git_first.dedup_key == git_again.dedup_key
        assert git_first.start == 660

    def test_files_grouped_by_parent_dir(self) -> None:
        candidates = _rule_candidates(make_evidence())
        files = [c for c in candidates if "files" in c.sources]
        assert len(files) == 1
        assert "更新 2 个文件（demo/src）" in files[0].summary
        assert files[0].dedup_key.startswith("files:")

    def test_candidates_sorted_by_start_time(self) -> None:
        candidates = _rule_candidates(make_evidence())
        starts = [c.start for c in candidates]
        assert starts == sorted(starts, key=lambda v: (v is None, v or 0))
        # zcode(540) → git(660) → files(690)
        assert [c.sources[0] for c in candidates] == ["zcode", "git", "files"]

    def test_titled_session_summary(self) -> None:
        evidence = make_evidence(
            sources={
                "zcode": {
                    "available": True,
                    "note": None,
                    "sessions": [
                        {
                            "session_id": "s1",
                            "title": "修复活动导入去重",
                            "directory": "/Users/h/Documents/AI/AI 日程管理系统",
                            "start": local_iso(9, 0),
                            "end": local_iso(9, 50),
                            "tool_calls": 12,
                            "top_tools": [{"name": "Edit", "count": 6}],
                            "files_edited": ["/proj/src/types.ts", "/proj/src/a.ts"],
                            "commands": ["git", "npm"],
                        }
                    ],
                }
            }
        )
        zcode = [c for c in _rule_candidates(evidence) if "zcode" in c.sources][0]
        assert zcode.summary == "「修复活动导入去重」（AI 日程管理系统，09:00–09:50）：改 2 个文件"
        assert zcode.titles == ["修复活动导入去重"]
        assert "types.ts" in zcode.evidence and "命令：git" in zcode.evidence
        # dedup_key 含日期：跨天活跃的同名会话不会在第二天被误判「已导入」
        assert zcode.dedup_key.startswith("zcode:")

    def test_merged_sessions_lead_with_first_title(self) -> None:
        evidence = make_evidence(
            sources={
                "zcode": {
                    "available": True,
                    "note": None,
                    "sessions": [
                        {
                            "session_id": "s1",
                            "title": "早上的会话",
                            "start": local_iso(9, 0),
                            "end": local_iso(9, 30),
                            "tool_calls": 3,
                            "top_tools": [],
                        },
                        {
                            "session_id": "s2",
                            "title": "晚些的会话",
                            "start": local_iso(9, 40),
                            "end": local_iso(10, 0),
                            "tool_calls": 4,
                            "top_tools": [],
                            "files_edited": ["/p/a.ts"],
                        },
                    ],
                }
            }
        )
        zcode = [c for c in _rule_candidates(evidence) if "zcode" in c.sources][0]
        assert zcode.summary == "「早上的会话」等 2 个会话（09:00–10:00）：改 1 个文件"
        assert zcode.titles == ["早上的会话", "晚些的会话"]

    def test_ai_material_carries_titles_and_files(self) -> None:
        evidence = make_evidence(
            sources={
                "zcode": {
                    "available": True,
                    "note": None,
                    "sessions": [
                        {
                            "session_id": "s1",
                            "title": "修复活动导入去重",
                            "directory": "/Users/h/Documents/AI/AI 日程管理系统",
                            "start": local_iso(9, 0),
                            "end": local_iso(9, 50),
                            "tool_calls": 12,
                            "top_tools": [],
                            "files_edited": ["/proj/src/types.ts"],
                            "commands": ["git"],
                        }
                    ],
                }
            }
        )
        captured: dict[str, str] = {}

        async def fake_call(system_prompt, user_text, provider, settings, **kwargs):
            captured["system"] = system_prompt
            captured["user"] = user_text
            return {"choices": [{"message": {"content": '{"items":[]}'}}]}

        monkeypatch_local = pytest.MonkeyPatch()
        monkeypatch_local.setattr(activity_digest, "call_chat_completions", fake_call)
        try:
            settings = Settings(ai_provider="deepseek", deepseek_api_key="test-key")
            _digest({"evidence": evidence, "api_key": "test-key"}, settings)
        finally:
            monkeypatch_local.undo()
        assert '"titles": ["修复活动导入去重"]' in captured["user"]
        assert '"files": ["types.ts"]' in captured["user"]
        assert "不得编造" in captured["system"]

    def test_category_resume_materials_belong_to_work(self) -> None:
        evidence = make_evidence(
            sources={
                "zcode": {
                    "available": True,
                    "note": None,
                    "sessions": [
                        {
                            "session_id": "s1",
                            "title": "更新 AI 应用落地定向简历及 AI 产品、运营简历",
                            "start": local_iso(9, 0),
                            "end": local_iso(9, 50),
                            "tool_calls": 9,
                            "top_tools": [],
                            "files_edited": ["/Users/h/Documents/AI/求职/AI产品助理-简历.html"],
                        }
                    ],
                }
            }
        )
        zcode = [c for c in _rule_candidates(evidence) if "zcode" in c.sources][0]
        assert zcode.category == "work"

    def test_category_learning_session_is_study(self) -> None:
        evidence = make_evidence(
            sources={
                "zcode": {
                    "available": True,
                    "note": None,
                    "sessions": [
                        {
                            "session_id": "s1",
                            "title": "AI视频生成主流方式入门",
                            "start": local_iso(9, 0),
                            "end": local_iso(9, 50),
                            "tool_calls": 2,
                            "top_tools": [],
                        }
                    ],
                }
            }
        )
        zcode = [c for c in _rule_candidates(evidence) if "zcode" in c.sources][0]
        assert zcode.category == "study"

    def test_category_defaults_to_work_without_signals(self) -> None:
        candidates = _rule_candidates(make_evidence())
        zcode = [c for c in candidates if "zcode" in c.sources][0]
        git = [c for c in candidates if "git" in c.sources][0]
        files = [c for c in candidates if "files" in c.sources][0]
        assert zcode.category == "work"
        assert git.category == "work"
        assert files.category == "work"

    def test_ai_prompt_carries_classification_priority(self) -> None:
        captured: dict[str, str] = {}

        async def fake_call(system_prompt, user_text, provider, settings, **kwargs):
            captured["system"] = system_prompt
            return {"choices": [{"message": {"content": '{"items":[]}'}}]}

        monkeypatch_local = pytest.MonkeyPatch()
        monkeypatch_local.setattr(activity_digest, "call_chat_completions", fake_call)
        try:
            settings = Settings(ai_provider="deepseek", deepseek_api_key="test-key")
            _digest({"evidence": make_evidence(), "api_key": "test-key"}, settings)
        finally:
            monkeypatch_local.undo()
        assert "求职面试" in captured["system"]
        assert "归 work" in captured["system"]

    def test_empty_evidence_yields_no_candidates(self) -> None:
        evidence = make_evidence(
            sources={"zcode": {"available": False, "note": None, "sessions": []},
                     "git": {"available": True, "note": None, "repos": []},
                     "files": {"available": True, "note": None, "truncated": False, "files": []}}
        )
        assert _rule_candidates(evidence) == []


class TestAiPolish:
    def test_applies_summary_and_category_for_known_keys(self) -> None:
        candidates = _rule_candidates(make_evidence())
        payload = {
            "items": [
                {"dedup_key": candidates[0].dedup_key, "summary": "上午用 AI 助手写采集脚本", "category": "study"},
                {"dedup_key": "unknown-key", "summary": "不应生效", "category": "life"},
            ]
        }
        polished = activity_digest._apply_ai_polish(candidates, payload)
        assert len(polished) == len(candidates)  # 未知 key 被忽略，条目不增不减
        assert polished[0].summary == "上午用 AI 助手写采集脚本"
        assert polished[0].category == "study"
        # 时间窗与来源不受 LLM 影响
        assert polished[0].start == candidates[0].start
        assert polished[0].sources == candidates[0].sources

    def test_invalid_category_falls_back_to_rules(self) -> None:
        candidates = _rule_candidates(make_evidence())
        payload = {"items": [{"dedup_key": candidates[0].dedup_key, "summary": "x", "category": "旅行"}]}
        polished = activity_digest._apply_ai_polish(candidates, payload)
        assert polished[0].category == candidates[0].category

    def test_malformed_payload_raises(self) -> None:
        candidates = _rule_candidates(make_evidence())
        with pytest.raises(ValueError):
            activity_digest._apply_ai_polish(candidates, {"items": "not-a-list"})
        with pytest.raises(ValueError):
            activity_digest._apply_ai_polish(candidates, "not-a-dict")


def _digest(request_body: dict[str, Any], settings: Settings | None = None) -> ActivityDigestResponse:
    payload = ActivityDigestRequest.model_validate(request_body)
    resolved_settings = settings or Settings(ai_provider="local", openai_api_key="", deepseek_api_key="")
    return asyncio.run(
        activity_digest.digest_activities(payload, payload.provider, resolved_settings, api_key=payload.api_key)
    )


class TestDigestService:
    def test_without_ai_returns_rule_candidates(self) -> None:
        response = _digest({"evidence": make_evidence()})
        assert response.source == "local" and response.used_ai is False
        assert len(response.candidates) == 3
        assert response.message is None

    def test_empty_evidence_message(self) -> None:
        response = _digest({"evidence": make_evidence(sources={"zcode": {"available": False, "note": None, "sessions": []}, "git": {"available": True, "note": None, "repos": []}, "files": {"available": True, "note": None, "truncated": False, "files": []}})})
        assert response.candidates == []
        assert response.message and "没有可识别的活动" in response.message

    def test_ai_success_polishes_candidates(self, monkeypatch: pytest.MonkeyPatch) -> None:
        rules = _rule_candidates(make_evidence())

        async def fake_call(system_prompt, user_text, provider, settings, **kwargs):
            assert kwargs.get("operation") == "activity_digest"
            content = '{"items":[' + ",".join(
                f'{{"dedup_key":"{c.dedup_key}","summary":"归纳后的活动 {index}","category":"work"}}'
                for index, c in enumerate(rules)
            ) + "]}"

            return {"choices": [{"message": {"content": content}}]}

        monkeypatch.setattr(activity_digest, "call_chat_completions", fake_call)
        settings = Settings(ai_provider="deepseek", deepseek_api_key="test-key")
        response = _digest({"evidence": make_evidence(), "api_key": "test-key"}, settings)
        assert response.source == "deepseek" and response.used_ai is True
        assert response.message is None
        assert [c.summary for c in response.candidates] == [
            f"归纳后的活动 {index}" for index in range(len(rules))
        ]

    def test_ai_timeout_falls_back_to_rules(self, monkeypatch: pytest.MonkeyPatch) -> None:
        async def fake_call(*args, **kwargs):
            raise httpx.TimeoutException("timeout")

        monkeypatch.setattr(activity_digest, "call_chat_completions", fake_call)
        settings = Settings(ai_provider="deepseek", deepseek_api_key="test-key")
        response = _digest({"evidence": make_evidence(), "api_key": "test-key"}, settings)
        assert response.used_ai is False and len(response.candidates) == 3
        assert response.message and "超时" in response.message and "规则归纳" in response.message

    def test_ai_malformed_output_falls_back(self, monkeypatch: pytest.MonkeyPatch) -> None:
        async def fake_call(*args, **kwargs):
            return {"choices": [{"message": {"content": "这不是 JSON"}}]}

        monkeypatch.setattr(activity_digest, "call_chat_completions", fake_call)
        settings = Settings(ai_provider="deepseek", deepseek_api_key="test-key")
        response = _digest({"evidence": make_evidence(), "api_key": "test-key"}, settings)
        assert response.used_ai is False and len(response.candidates) == 3
        assert response.message and "规则归纳" in response.message

    def test_use_ai_false_skips_llm(self, monkeypatch: pytest.MonkeyPatch) -> None:
        async def fail_call(*args, **kwargs):
            raise AssertionError("use_ai=False 时不应调用 LLM")

        monkeypatch.setattr(activity_digest, "call_chat_completions", fail_call)
        settings = Settings(ai_provider="deepseek", deepseek_api_key="test-key")
        response = _digest({"evidence": make_evidence(), "use_ai": False, "api_key": "test-key"}, settings)
        assert response.source == "local" and response.used_ai is False
        assert len(response.candidates) == 3


def settings_override() -> Settings:
    return Settings(ai_provider="local", openai_api_key="", deepseek_api_key="")


app.dependency_overrides[get_settings] = settings_override
client = TestClient(app)


@pytest.fixture(autouse=True)
def _reset_limiters():
    route_limiter.reset()
    app.state.limiter.reset()
    yield
    route_limiter.reset()
    app.state.limiter.reset()


class TestDigestEndpoint:
    def test_rules_path_returns_candidates(self) -> None:
        response = client.post("/api/v1/activities/digest", json={"evidence": make_evidence()})
        assert response.status_code == 200
        body = response.json()
        assert body["source"] == "local" and body["used_ai"] is False
        assert len(body["candidates"]) == 3
        first = body["candidates"][0]
        assert first["dedup_key"].startswith("zcode:")
        assert first["start"] == 540

    def test_bad_structure_returns_400(self) -> None:
        response = client.post("/api/v1/activities/digest", json={"evidence": {"date": 123}})
        assert response.status_code == 400
        assert "证据文件结构" in response.json()["detail"]

    def test_oversize_returns_413(self) -> None:
        original = app.dependency_overrides[get_settings]
        app.dependency_overrides[get_settings] = lambda: Settings(
            ai_provider="local", max_activity_evidence_bytes=10
        )
        try:
            response = client.post("/api/v1/activities/digest", json={"evidence": make_evidence()})
            assert response.status_code == 413
            assert "上限" in response.json()["detail"]
        finally:
            app.dependency_overrides[get_settings] = original

    def test_rate_limit_returns_429(self) -> None:
        for _ in range(10):
            response = client.post("/api/v1/activities/digest", json={"evidence": make_evidence()})
            assert response.status_code == 200
        limited = client.post("/api/v1/activities/digest", json={"evidence": make_evidence()})
        assert limited.status_code == 429
