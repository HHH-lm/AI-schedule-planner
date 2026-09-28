"""activity_collector 回归测试：三类数据源的解析与容错，全部确定性。

ZCode 日志为 fixture JSONL（只含元数据字段），git 用 fake runner 注入，
文件源走 tmp_path 真实文件系统；不触网、不读真实用户日志。
"""

from __future__ import annotations

import json
import os
import sqlite3
import subprocess
from datetime import date, datetime
from pathlib import Path

import pytest

from app import activity_collector as collector

DAY = date(2026, 9, 27)


def local_datetime(*args: int) -> datetime:
    return datetime(*args).astimezone()


def datetime_stamp(day: date, hour: int, minute: int) -> float:
    return datetime(day.year, day.month, day.day, hour, minute).timestamp()


def _write_log(path: Path, records: list[dict]) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        for record in records:
            handle.write(json.dumps(record, ensure_ascii=False) + "\n")
    return path


def _tool_event(session_id: str, timestamp: str, tool_name: str) -> dict:
    return {
        "event": "tool.call.started",
        "timestamp": timestamp,
        "sessionId": session_id,
        "level": "info",
        "module": "test",
        "message": "ignored",
        "context": {"toolName": tool_name},
    }


class TestZcodeSessions:
    def test_aggregates_session_window_and_tools(self, tmp_path: Path) -> None:
        log = _write_log(
            tmp_path / "zcode-2026-09-27.jsonl",
            [
                # 同一会话内两个工具调用 + 一个 turn 事件，窗口取首末时间戳
                _tool_event("sess-a", "2026-09-27T01:10:00+00:00", "Bash"),
                _tool_event("sess-a", "2026-09-27T01:12:00+00:00", "Bash"),
                _tool_event("sess-a", "2026-09-27T01:20:00+00:00", "Read"),
                {
                    "event": "turn.started",
                    "timestamp": "2026-09-27T01:05:00+00:00",
                    "sessionId": "sess-a",
                },
                # 另一会话，按开始时间排在后面
                _tool_event("sess-b", "2026-09-27T05:00:00+00:00", "Write"),
            ],
        )
        result = collector.collect_zcode_sessions(log, DAY)
        assert result["available"] is True and result["note"] is None
        assert [s["session_id"] for s in result["sessions"]] == ["sess-a", "sess-b"]
        first = result["sessions"][0]
        # UTC 时间戳已转本地时区；期望值由同一时区换算，不硬编码机器时区
        expected_start = datetime.fromisoformat("2026-09-27T01:05:00+00:00").astimezone()
        expected_end = datetime.fromisoformat("2026-09-27T01:20:00+00:00").astimezone()
        assert first["start"] == expected_start.isoformat(timespec="seconds")
        assert first["end"] == expected_end.isoformat(timespec="seconds")
        assert first["tool_calls"] == 3
        assert first["top_tools"][0] == {"name": "Bash", "count": 2}
        # 会话内小间隔（≤15 分钟）不切段
        assert len(first["segments"]) == 1
        assert first["segments"][0]["start"] == first["start"]
        assert first["segments"][0]["end"] == first["end"]

    def test_splits_session_on_idle_gap(self, tmp_path: Path) -> None:
        log = _write_log(
            tmp_path / "zcode-2026-09-27.jsonl",
            [
                _tool_event("sess-a", "2026-09-27T01:00:00+00:00", "Bash"),
                _tool_event("sess-a", "2026-09-27T01:10:00+00:00", "Read"),
                # 空闲 30 分钟 → 切段；会话级 start/end 仍是整段包络
                _tool_event("sess-a", "2026-09-27T01:40:00+00:00", "Edit"),
                _tool_event("sess-a", "2026-09-27T01:50:00+00:00", "Bash"),
            ],
        )
        result = collector.collect_zcode_sessions(log, DAY)
        first = result["sessions"][0]

        def expected(stamp: str) -> str:
            return datetime.fromisoformat(stamp).astimezone().isoformat(timespec="seconds")

        assert first["start"] == expected("2026-09-27T01:00:00+00:00")
        assert first["end"] == expected("2026-09-27T01:50:00+00:00")
        assert len(first["segments"]) == 2
        assert first["segments"][0]["end"] == expected("2026-09-27T01:10:00+00:00")
        assert first["segments"][1]["start"] == expected("2026-09-27T01:40:00+00:00")

    def test_ignores_unknown_events_other_days_and_broken_lines(
        self, tmp_path: Path
    ) -> None:
        log = _write_log(
            tmp_path / "zcode-2026-09-27.jsonl",
            [
                {"event": "session.event.persistence.started", "timestamp": "2026-09-27T02:00:00+00:00", "sessionId": "sess-x"},
                _tool_event("sess-x", "2026-09-25T12:00:00+00:00", "Bash"),  # 别的日子
                _tool_event("sess-x", "2026-09-27T02:01:00+00:00", "Read"),
                {"event": "tool.call.started", "timestamp": "not-a-date", "sessionId": "sess-x"},
                {"event": "tool.call.started", "timestamp": "2026-09-27T02:02:00+00:00"},  # 无 sessionId
                "not-json-at-all",
            ],
        )
        result = collector.collect_zcode_sessions(log, DAY)
        assert result["available"] is True
        assert len(result["sessions"]) == 1
        assert result["sessions"][0]["tool_calls"] == 1

    def test_missing_log_file_marks_unavailable(self, tmp_path: Path) -> None:
        result = collector.collect_zcode_sessions(tmp_path / "missing.jsonl", DAY)
        assert result["available"] is False
        assert result["sessions"] == []
        assert result["note"]


class TestGitCommits:
    @staticmethod
    def _fake_run(stdout: str, returncode: int = 0, stderr: str = ""):
        def run(cmd: list[str], **kwargs) -> subprocess.CompletedProcess:
            return subprocess.CompletedProcess(cmd, returncode, stdout=stdout, stderr=stderr)

        return run

    def test_parses_commits_with_pipe_in_subject(self, tmp_path: Path) -> None:
        repo = tmp_path / "repo"
        (repo / ".git").mkdir(parents=True)
        run = self._fake_run("abc123|%aI-demo|feat: 支持 a|b 语法\ndef456|2026-09-27T10:00:00+08:00|fix: 修复\n")
        result = collector.collect_git_commits([repo], DAY, run=run)
        assert result["available"] is True and result["note"] is None
        assert len(result["repos"]) == 1
        commits = result["repos"][0]["commits"]
        # 主题中的竖线不被误拆
        assert commits[0] == {"hash": "abc123", "time": "%aI-demo", "subject": "feat: 支持 a|b 语法"}
        assert commits[1]["hash"] == "def456"

    def test_skips_repo_on_git_error(self, tmp_path: Path) -> None:
        repo = tmp_path / "empty"
        (repo / ".git").mkdir(parents=True)
        run = self._fake_run("", returncode=128, stderr="fatal: your current branch 'main' does not have any commits yet")
        result = collector.collect_git_commits([repo], DAY, run=run)
        assert result["repos"] == []
        assert "does not have any commits" in (result["note"] or "")

    def test_skips_non_git_directory(self, tmp_path: Path) -> None:
        plain = tmp_path / "plain"
        plain.mkdir()
        result = collector.collect_git_commits([plain], DAY, run=self._fake_run(""))
        assert result["repos"] == []
        assert "非 git 仓库" in (result["note"] or "")


class TestChangedFiles:
    def test_matches_files_modified_on_day(self, tmp_path: Path) -> None:
        (tmp_path / "src").mkdir(parents=True)
        target = tmp_path / "src" / "notes.md"
        target.write_text("x")
        stamp = datetime_stamp(DAY, 10, 30)
        os.utime(target, (stamp, stamp))
        old = tmp_path / "old.md"
        old.write_text("x")
        os.utime(old, (datetime_stamp(date(2026, 9, 1), 8, 0),) * 2)

        result = collector.collect_changed_files([tmp_path], DAY)
        paths = [f["path"] for f in result["files"]]
        assert paths == [str(target)]
        assert result["truncated"] is False

    def test_skips_hidden_and_heavy_dirs(self, tmp_path: Path) -> None:
        for dirname in (".git", "node_modules"):
            heavy = tmp_path / dirname / "pkg"
            heavy.mkdir(parents=True)
            target = heavy / "index.js"
            target.write_text("x")
            stamp = datetime_stamp(DAY, 12, 0)
            os.utime(target, (stamp, stamp))
        kept_dir = tmp_path / "docs"
        kept_dir.mkdir()
        kept = kept_dir / "a.md"
        kept.write_text("x")
        os.utime(kept, (datetime_stamp(DAY, 12, 0),) * 2)

        result = collector.collect_changed_files([tmp_path], DAY)
        assert [Path(f["path"]).name for f in result["files"]] == ["a.md"]

    def test_truncates_to_max_files(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(collector, "MAX_FILES", 2)
        for index in range(4):
            target = tmp_path / f"f{index}.txt"
            target.write_text("x")
            stamp = datetime_stamp(DAY, 9, index)
            os.utime(target, (stamp, stamp))
        result = collector.collect_changed_files([tmp_path], DAY)
        assert result["truncated"] is True
        assert len(result["files"]) == 2
        # 按修改时间倒序保留最新的
        assert [Path(f["path"]).name for f in result["files"]] == ["f3.txt", "f2.txt"]

    def test_excludes_junk_and_dot_files(self, tmp_path: Path) -> None:
        stamp = datetime_stamp(DAY, 10, 0)
        for name in (".DS_Store", ".env", ".backend.log", "Thumbs.db", "~$报告.docx", "keep.md", "x.tmp"):
            target = tmp_path / name
            target.write_text("x")
            os.utime(target, (stamp, stamp))
        result = collector.collect_changed_files([tmp_path], DAY)
        assert [Path(f["path"]).name for f in result["files"]] == ["keep.md"]


def _epoch_ms(day: date, hour: int, minute: int) -> int:
    return int(datetime(day.year, day.month, day.day, hour, minute).timestamp() * 1000)


def _iso_ms(ms: int) -> str:
    return datetime.fromtimestamp(ms / 1000).astimezone().isoformat(timespec="seconds")


def _make_db(path: Path, *, sessions, tool_usage, parts) -> Path:
    conn = sqlite3.connect(path)
    conn.execute("CREATE TABLE session (id TEXT PRIMARY KEY, title TEXT, directory TEXT)")
    conn.execute("CREATE TABLE tool_usage (session_id TEXT, started_at INTEGER, completed_at INTEGER)")
    conn.execute("CREATE TABLE part (session_id TEXT, time_created INTEGER, data TEXT)")
    conn.executemany("INSERT INTO session VALUES (?,?,?)", sessions)
    conn.executemany("INSERT INTO tool_usage VALUES (?,?,?)", tool_usage)
    conn.executemany("INSERT INTO part VALUES (?,?,?)", parts)
    conn.commit()
    conn.close()
    return path


def _tool_part(session_id: str, when_ms: int, tool: str, input_data: dict) -> tuple:
    data = json.dumps({"type": "tool", "tool": tool, "state": {"input": input_data}})
    return (session_id, when_ms, data)


class TestZcodeDbSource:
    def test_extracts_title_files_commands_and_window(self, tmp_path: Path) -> None:
        start_ms = _epoch_ms(DAY, 9, 0)
        end_ms = _epoch_ms(DAY, 9, 14)
        db = _make_db(
            tmp_path / "db.sqlite",
            sessions=[("sess-a", "修复活动导入去重", "/Users/h/Documents/AI/AI 日程管理系统")],
            tool_usage=[("sess-a", start_ms, end_ms), ("sess-a", start_ms + 60000, end_ms - 30000)],
            parts=[
                _tool_part("sess-a", start_ms, "Edit", {"file_path": "/p/src/types.ts"}),
                _tool_part("sess-a", start_ms, "Write", {"file_path": "/p/src/types.ts"}),
                _tool_part("sess-a", start_ms, "Bash", {"command": "git status"}),
                _tool_part("sess-a", start_ms, "Bash", {"command": "npm test"}),
                _tool_part("sess-a", start_ms, "Bash", {"command": "git log"}),
                _tool_part("sess-a", start_ms, "Read", {"file_path": "/p/notes.md"}),
            ],
        )
        result = collector.collect_zcode_sessions_from_db(db, DAY)
        assert result is not None and result["available"] is True
        session = result["sessions"][0]
        expected_start = datetime.fromtimestamp(start_ms / 1000).astimezone()
        expected_end = datetime.fromtimestamp(end_ms / 1000).astimezone()
        assert session["title"] == "修复活动导入去重"
        assert session["directory"].endswith("AI 日程管理系统")
        assert session["start"] == expected_start.isoformat(timespec="seconds")
        assert session["end"] == expected_end.isoformat(timespec="seconds")
        assert session["files_edited"] == ["/p/src/types.ts"]
        assert session["commands"] == ["git", "npm"]

    def test_splits_bursts_on_idle_gap(self, tmp_path: Path) -> None:
        db = _make_db(
            tmp_path / "db.sqlite",
            sessions=[("sess-a", "跨午后的会话", "/tmp/proj")],
            tool_usage=[
                ("sess-a", _epoch_ms(DAY, 0, 44), _epoch_ms(DAY, 0, 57)),
                # 空闲 14 小时 → 切段
                ("sess-a", _epoch_ms(DAY, 15, 5), _epoch_ms(DAY, 15, 10)),
                # 与上一行仅隔 9 分钟 → 并入同段
                ("sess-a", _epoch_ms(DAY, 15, 19), _epoch_ms(DAY, 15, 30)),
                # 恰好 15 分钟间隔 → 不切（阈值判定为 >）
                ("sess-a", _epoch_ms(DAY, 15, 45), _epoch_ms(DAY, 15, 50)),
            ],
            parts=[],
        )
        result = collector.collect_zcode_sessions_from_db(db, DAY)
        session = result["sessions"][0]
        assert session["tool_calls"] == 4
        assert session["start"] == _iso_ms(_epoch_ms(DAY, 0, 44))
        assert session["end"] == _iso_ms(_epoch_ms(DAY, 15, 50))
        assert len(session["segments"]) == 2
        assert session["segments"][0] == {
            "start": _iso_ms(_epoch_ms(DAY, 0, 44)),
            "end": _iso_ms(_epoch_ms(DAY, 0, 57)),
        }
        assert session["segments"][1] == {
            "start": _iso_ms(_epoch_ms(DAY, 15, 5)),
            "end": _iso_ms(_epoch_ms(DAY, 15, 50)),
        }

    def test_caps_long_running_tool_presence(self, tmp_path: Path) -> None:
        # 后台工作流单次执行 14 小时（9/24 实测 854 分钟）：存在感封顶 15 分钟，
        # 不把整天桥成一条
        db = _make_db(
            tmp_path / "db.sqlite",
            sessions=[("sess-a", "京东工作流", "/tmp/proj")],
            tool_usage=[
                ("sess-a", _epoch_ms(DAY, 1, 39), _epoch_ms(DAY, 2, 8)),
                ("sess-a", _epoch_ms(DAY, 1, 54), _epoch_ms(DAY, 16, 9)),  # 挂机进程
            ],
            parts=[],
        )
        result = collector.collect_zcode_sessions_from_db(db, DAY)
        session = result["sessions"][0]
        assert len(session["segments"]) == 1
        # 会话终点=封顶后的存在感终点（01:54+15 分钟），不是挂机进程退出的 16:09
        assert session["end"] == _iso_ms(_epoch_ms(DAY, 2, 9))

    def test_null_completed_falls_back_to_started(self, tmp_path: Path) -> None:
        db = _make_db(
            tmp_path / "db.sqlite",
            sessions=[("sess-a", None, None)],
            tool_usage=[
                ("sess-a", _epoch_ms(DAY, 9, 0), _epoch_ms(DAY, 9, 5)),
                ("sess-a", _epoch_ms(DAY, 9, 10), None),  # 仍在运行：段尾退化为开始时间
                ("sess-a", _epoch_ms(DAY, 12, 0), None),  # 空闲近 3 小时 → 新段
            ],
            parts=[],
        )
        result = collector.collect_zcode_sessions_from_db(db, DAY)
        session = result["sessions"][0]
        assert len(session["segments"]) == 2
        assert session["segments"][0]["end"] == _iso_ms(_epoch_ms(DAY, 9, 10))
        assert session["segments"][1] == {
            "start": _iso_ms(_epoch_ms(DAY, 12, 0)),
            "end": _iso_ms(_epoch_ms(DAY, 12, 0)),
        }

    def test_truncates_segments_with_note(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(collector, "MAX_SESSION_SEGMENTS", 2)
        db = _make_db(
            tmp_path / "db.sqlite",
            sessions=[("sess-a", None, None)],
            tool_usage=[
                ("sess-a", _epoch_ms(DAY, 9 + hour, 0), _epoch_ms(DAY, 9 + hour, 5))
                for hour in range(4)  # 每小时一行 → 4 段
            ],
            parts=[],
        )
        result = collector.collect_zcode_sessions_from_db(db, DAY)
        assert result is not None
        assert len(result["sessions"][0]["segments"]) == 2
        assert "截断" in (result["note"] or "")

    def test_missing_db_returns_none_and_fallback_notes(self, tmp_path: Path) -> None:
        assert collector.collect_zcode_sessions_from_db(tmp_path / "none.sqlite", DAY) is None
        evidence = collector.build_evidence(
            DAY,
            zcode_db_path=tmp_path / "none.sqlite",
            zcode_log_dir=tmp_path,
            repos=[str(tmp_path)],
            scan_dirs=[str(tmp_path)],
            generated_at=local_datetime(2026, 9, 27, 21, 0),
        )
        assert "回退" in (evidence["sources"]["zcode"]["note"] or "")

    def test_corrupt_db_returns_none(self, tmp_path: Path) -> None:
        bad = tmp_path / "db.sqlite"
        bad.write_bytes(b"not a sqlite file at all")
        assert collector.collect_zcode_sessions_from_db(bad, DAY) is None


class TestBuildEvidence:
    def test_composes_three_sources(self, tmp_path: Path) -> None:
        zcode_dir = tmp_path / "log"
        _write_log(
            zcode_dir / f"zcode-{DAY.isoformat()}.jsonl",
            [_tool_event("sess-a", "2026-09-27T01:00:00+00:00", "Bash")],
        )
        repo = tmp_path / "repo"
        (repo / ".git").mkdir(parents=True)
        scan_dir = tmp_path / "scan"
        scan_dir.mkdir()
        touched = scan_dir / "a.md"
        touched.write_text("x")
        stamp = datetime_stamp(DAY, 11, 0)
        os.utime(touched, (stamp, stamp))

        evidence = collector.build_evidence(
            DAY,
            zcode_db_path=tmp_path / "missing.sqlite",
            zcode_log_dir=zcode_dir,
            repos=[str(repo)],
            scan_dirs=[str(scan_dir)],
            generated_at=local_datetime(2026, 9, 27, 21, 0),
            run=lambda cmd, **kwargs: subprocess.CompletedProcess(
                cmd, 0, "h1|2026-09-27T10:00:00+08:00|feat: x\n", ""
            ),
        )
        assert evidence["schema"] == collector.EVIDENCE_SCHEMA
        assert evidence["date"] == DAY.isoformat()
        assert evidence["sources"]["zcode"]["sessions"][0]["session_id"] == "sess-a"
        assert evidence["sources"]["git"]["repos"][0]["name"] == "repo"
        assert evidence["sources"]["files"]["files"][0]["path"] == str(touched)

    def test_writes_named_file(self, tmp_path: Path) -> None:
        evidence = collector.build_evidence(
            DAY,
            zcode_db_path=tmp_path / "missing.sqlite",
            zcode_log_dir=tmp_path / "none",
            repos=[str(tmp_path)],
            scan_dirs=[str(tmp_path)],
            generated_at=local_datetime(2026, 9, 27, 21, 0),
        )
        path = collector.write_evidence(evidence, tmp_path / "out")
        assert path.name == f"activity_evidence_{DAY.isoformat()}.json"
        loaded = json.loads(path.read_text(encoding="utf-8"))
        assert loaded["date"] == DAY.isoformat()


class TestMain:
    def test_date_range_writes_one_file_per_day(self, tmp_path: Path, capsys: pytest.CaptureFixture) -> None:
        code = collector.main(
            [
                "--from", "2026-09-25",
                "--to", "2026-09-27",
                "--out", str(tmp_path / "out"),
                "--zcode-db", str(tmp_path / "missing.sqlite"),
                "--zcode-log-dir", str(tmp_path),
                "--repo", str(tmp_path),
                "--dir", str(tmp_path),
            ]
        )
        assert code == 0
        names = sorted(p.name for p in (tmp_path / "out").iterdir())
        assert names == [
            "activity_evidence_2026-09-25.json",
            "activity_evidence_2026-09-26.json",
            "activity_evidence_2026-09-27.json",
        ]
        assert "2026-09-25" in capsys.readouterr().out

    def test_rejects_inverted_range(self) -> None:
        with pytest.raises(SystemExit):
            collector.main(["--from", "2026-09-27", "--to", "2026-09-25"])

    def test_rejects_bad_date(self) -> None:
        with pytest.raises(SystemExit):
            collector.main(["--date", "09/27"])
