import { describe, expect, it } from "vitest";
import {
  buildCollectDayList,
  extractCandidates,
  findPlanConflicts,
  formatCandidateTime,
  missingCollectDates,
  parseEvidenceFile,
  selectedToActivities,
  summaryTotal,
  type ActivityCandidateView,
  type ActivityCollectItemRaw,
  type ActivityDigestPayload,
} from "./activityImport";
import type { Activity, TimeBlock } from "./types";

const validEvidence = {
  schema: "activity-evidence/1",
  date: "2026-09-27",
  generated_at: "2026-09-27T21:00:00+08:00",
  sources: {
    zcode: {
      available: true,
      note: null,
      sessions: [{ session_id: "s1", start: "2026-09-27T09:00:00+08:00" }],
    },
    git: {
      available: true,
      note: null,
      repos: [{ path: "/r", name: "r", commits: [{ hash: "h1", time: null, subject: "x" }] }],
    },
    files: {
      available: true,
      note: null,
      truncated: false,
      files: [{ path: "/r/a.md", mtime: null }],
    },
  },
};

function digestPayload(
  overrides: Partial<ActivityDigestPayload> = {}
): ActivityDigestPayload {
  return {
    source: "local",
    used_ai: false,
    candidates: [
      {
        dedup_key: "zcode:s1",
        date: "2026-09-27",
        start: 540,
        end: 630,
        summary: "ZCode 会话（09:00–10:30）：8 次工具调用",
        category: "work",
        sources: ["zcode"],
        evidence: "1 个会话",
      },
      {
        dedup_key: "git:h1",
        date: "2026-09-27",
        start: null,
        end: null,
        summary: "仓库「r」提交 1 次",
        category: "旅行",
        sources: ["git"],
        evidence: null,
      },
    ],
    message: null,
    ...overrides,
  };
}

describe("parseEvidenceFile", () => {
  it("校验合法证据并统计三类来源数量", () => {
    const result = parseEvidenceFile(validEvidence);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.summary).toEqual({
        date: "2026-09-27",
        zcodeSessions: 1,
        gitCommits: 1,
        files: 1,
      });
      expect(result.evidence).toBe(validEvidence);
    }
  });

  it("拒绝非对象与缺字段文件", () => {
    expect(parseEvidenceFile("[]").ok).toBe(false);
    expect(parseEvidenceFile(null).ok).toBe(false);
    const noDate = parseEvidenceFile({ sources: validEvidence.sources });
    expect(noDate.ok).toBe(false);
    if (!noDate.ok) expect(noDate.error).toContain("date");
    const noSources = parseEvidenceFile({ date: "2026-09-27" });
    expect(noSources.ok).toBe(false);
    if (!noSources.ok) expect(noSources.error).toContain("collect:activity");
  });

  it("全部来源为空时提示无活动", () => {
    const result = parseEvidenceFile({
      date: "2026-09-27",
      sources: {
        zcode: { available: true, note: null, sessions: [] },
        git: { available: true, note: null, repos: [] },
        files: { available: true, note: null, truncated: false, files: [] },
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("没有任何活动记录");
  });
});

describe("extractCandidates", () => {
  it("映射为视图并按既有指纹标记已导入", () => {
    const views = extractCandidates(digestPayload(), new Set(["zcode:s1"]));
    expect(views).toHaveLength(2);
    expect(views[0]).toMatchObject({
      dedupKey: "zcode:s1",
      start: 540,
      end: 630,
      imported: true,
      category: "work",
    });
    expect(views[1]).toMatchObject({
      dedupKey: "git:h1",
      start: undefined,
      end: undefined,
      imported: false,
      category: "work",
    });
  });

  it("过滤缺 dedup_key 的畸形条目并容忍空列表", () => {
    const views = extractCandidates(
      digestPayload({
        candidates: [
          { ...digestPayload().candidates[0], dedup_key: "" },
          digestPayload().candidates[1],
        ],
      }),
      new Set()
    );
    expect(views).toHaveLength(1);
    expect(extractCandidates(digestPayload({ candidates: undefined as never }), new Set())).toEqual([]);
  });
});

describe("formatCandidateTime", () => {
  it("输出 HH:MM–HH:MM，缺时间返回空串", () => {
    expect(formatCandidateTime(540, 630)).toBe("09:00–10:30");
    expect(formatCandidateTime(0, 1440)).toBe("00:00–24:00");
    expect(formatCandidateTime(undefined, 630)).toBe("");
  });
});

describe("findPlanConflicts", () => {
  const candidate: ActivityCandidateView = {
    dedupKey: "zcode:s1",
    date: "2026-08-03",
    start: 540,
    end: 600,
    summary: "写周报",
    category: "work",
    sources: ["zcode"],
    imported: false,
  };

  function makeBlock(overrides: Partial<TimeBlock>): TimeBlock {
    return {
      id: "b1",
      name: "计划块",
      date: "2026-08-03",
      start: 540,
      end: 600,
      category: "work",
      done: false,
      status: "scheduled",
      ...overrides,
    };
  }

  it("同日时间重叠即冲突", () => {
    const conflicts = findPlanConflicts([candidate], new Set(["zcode:s1"]), [
      makeBlock({ start: 570, end: 660 }),
    ]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({
      candidateKey: "zcode:s1",
      blockId: "b1",
      blockName: "计划块",
      date: "2026-08-03",
      blockStart: 570,
      blockEnd: 660,
    });
  });

  it("相邻不重叠、未勾选、无时间窗候选不冲突", () => {
    const noWindow: ActivityCandidateView = { ...candidate, dedupKey: "zcode:s2", start: undefined, end: undefined };
    expect(
      findPlanConflicts([candidate], new Set(["zcode:s1"]), [
        makeBlock({ start: 480, end: 540 }),
      ])
    ).toEqual([]);
    expect(findPlanConflicts([candidate], new Set(), [makeBlock({})])).toEqual([]);
    expect(
      findPlanConflicts([candidate, noWindow], new Set(["zcode:s2"]), [makeBlock({})])
    ).toEqual([]);
  });

  it("跨天计划块取当日段参与重叠", () => {
    const crossDay = makeBlock({
      id: "b2",
      name: "跨天值班",
      start: 22 * 60,
      end: 1440 + 8 * 60,
    });
    // 8/4 早 07:00-07:30 与跨天块在 8/4 的 00:00-08:00 段重叠
    const nextDay: ActivityCandidateView = {
      ...candidate,
      dedupKey: "zcode:s3",
      date: "2026-08-04",
      start: 420,
      end: 450,
    };
    const conflicts = findPlanConflicts([nextDay], new Set(["zcode:s3"]), [crossDay]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].blockName).toBe("跨天值班");
  });

  it("待排期块不参与重叠", () => {
    expect(
      findPlanConflicts([candidate], new Set(["zcode:s1"]), [
        makeBlock({ status: "pending" }),
      ])
    ).toEqual([]);
  });
});

describe("selectedToActivities", () => {
  it("只转换勾选的候选并带上确认时间与指纹", () => {
    const views = extractCandidates(digestPayload(), new Set());
    const activities = selectedToActivities(views, new Set(["git:h1"]));
    expect(activities).toHaveLength(1);
    const activity = activities[0];
    expect(activity.id).toBeTruthy();
    expect(activity.dedupKey).toBe("git:h1");
    expect(activity.sources).toEqual(["git"]);
    expect(activity.category).toBe("work");
    expect(activity.confirmedAt).toBeTruthy();
    expect("start" in activity).toBe(false);
  });

  it("无勾选返回空数组", () => {
    const views = extractCandidates(digestPayload(), new Set());
    expect(selectedToActivities(views, new Set())).toEqual([]);
  });
});

describe("buildCollectDayList", () => {
  const item = (overrides: Partial<ActivityCollectItemRaw> = {}): ActivityCollectItemRaw => ({
    date: "2026-09-27",
    filename: "activity_evidence_2026-09-27.json",
    summary: { zcode_sessions: 2, git_commits: 1, files: 3 },
    evidence: { date: "2026-09-27", sources: {} },
    error: null,
    ...overrides,
  });

  const activity = (date: string): Activity => ({
    id: `a-${date}`,
    date,
    summary: "x",
    category: "work",
    sources: ["zcode"],
    confirmedAt: "2026-09-27T10:00:00Z",
  });

  it("按日期倒序并换算三源计数", () => {
    const days = buildCollectDayList(
      [item({ date: "2026-09-25" }), item({ date: "2026-09-27" })],
      []
    );
    expect(days.map((day) => day.date)).toEqual(["2026-09-27", "2026-09-25"]);
    expect(days[0].summary).toEqual({
      date: "2026-09-27",
      zcodeSessions: 2,
      gitCommits: 1,
      files: 3,
    });
    expect(summaryTotal(days[0].summary)).toBe(6);
  });

  it("标注该日已导入条数", () => {
    const days = buildCollectDayList(
      [item({ date: "2026-09-27" })],
      [activity("2026-09-27"), activity("2026-09-27"), activity("2026-09-26")]
    );
    expect(days[0].importedCount).toBe(2);
  });

  it("失败项保留 error 且无 evidence（不可导入）", () => {
    const days = buildCollectDayList(
      [item({ date: "2026-09-26", evidence: null, filename: null, error: "boom" })],
      []
    );
    expect(days[0].error).toBe("boom");
    expect(days[0].evidence).toBeUndefined();
    expect(days[0].filename).toBeUndefined();
  });

  it("丢弃日期格式非法的项", () => {
    const days = buildCollectDayList(
      [item({ date: "2026/09/27" }), item({ date: "2026-09-27" })],
      []
    );
    expect(days).toHaveLength(1);
    expect(days[0].date).toBe("2026-09-27");
  });

  it("缺 summary 时计数归零", () => {
    const days = buildCollectDayList([item({ summary: null })], []);
    expect(summaryTotal(days[0].summary)).toBe(0);
  });
});

describe("missingCollectDates", () => {
  const today = new Date(2026, 8, 27); // 2026-09-27

  it("窗口内缺证据的日期升序返回（含今天）", () => {
    expect(missingCollectDates(["2026-09-26"], today, 3)).toEqual([
      "2026-09-25",
      "2026-09-27",
    ]);
  });

  it("全有则返回空", () => {
    expect(missingCollectDates(["2026-09-25", "2026-09-26", "2026-09-27"], today, 3)).toEqual([]);
  });

  it("窗口外的旧证据不顶替窗口内缺失", () => {
    expect(missingCollectDates(["2026-09-01"], today, 3)).toEqual([
      "2026-09-25",
      "2026-09-26",
      "2026-09-27",
    ]);
  });

  it("跨月边界正确回退", () => {
    expect(missingCollectDates([], new Date(2026, 9, 1), 3)).toEqual([
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
    ]);
  });
});
