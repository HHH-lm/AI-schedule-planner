import { describe, expect, it } from "vitest";
import { getWeekDays } from "./date";
import { buildWeeklyReport, computeWeekStats } from "./report";
import type { AppData, TimeBlock } from "./types";

const anchor = new Date(2026, 7, 3, 12, 0, 0);
const days = getWeekDays(0, anchor);

function makeBlock(overrides: Partial<TimeBlock>): TimeBlock {
  return {
    id: "b",
    name: "事项",
    date: "2026-08-03",
    start: 540,
    end: 600,
    category: "life",
    done: false,
    status: "scheduled",
    ...overrides,
  };
}

const data: AppData = {
  version: 1,
  tasks: [],
  timeBlocks: [
    makeBlock({
      id: "w1",
      name: "工作",
      date: "2026-08-03",
      start: 540,
      end: 600,
      category: "work",
      done: true,
    }),
    makeBlock({
      id: "s1",
      name: "学习",
      date: "2026-08-04",
      start: 600,
      end: 660,
      category: "study",
    }),
    makeBlock({
      id: "p1",
      name: "待处理",
      date: "2026-08-04",
      start: 600,
      end: 660,
      category: "life",
      status: "pending",
    }),
    makeBlock({
      id: "o1",
      name: "下周事项",
      date: "2026-08-10",
      start: 540,
      end: 600,
      category: "work",
    }),
  ],
};

describe("computeWeekStats", () => {
  it("只统计本周 scheduled 块并区分完成时长", () => {
    const stats = computeWeekStats(data, days);
    const work = stats.find((s) => s.category === "work");
    const study = stats.find((s) => s.category === "study");
    const life = stats.find((s) => s.category === "life");

    expect(work).toEqual({ category: "work", minutes: 60, doneMinutes: 60, count: 1 });
    expect(study).toEqual({ category: "study", minutes: 60, doneMinutes: 0, count: 1 });
    expect(life).toBeUndefined();
  });
});

describe("buildWeeklyReport", () => {
  it("生成复盘标题、统计表和时间分布表", () => {
    const report = buildWeeklyReport(data, days);
    expect(report).toContain("# 本周日程复盘（8月3日 - 8月9日，第");
    expect(report).toContain("## 时间统计");
    expect(report).toContain("## 24 小时时间分布");
    expect(report).toContain("| 工作 | 1小时 | 50% | 1小时 | 1 |");
    expect(report).toContain("| 学习 | 1小时 | 50% | - | 1 |");
    expect(report).toContain("| 上午 |");
  });

  it("排除 pending 与周外事项", () => {
    const report = buildWeeklyReport(data, days);
    expect(report).not.toContain("待处理");
    expect(report).not.toContain("下周事项");
  });

  it("统计跨天块在本周内的分钟数并展示次日结束", () => {
    const crossDayData: AppData = {
      version: 1,
      tasks: [],
      timeBlocks: [
        makeBlock({
          id: "n1",
          name: "跨天值班",
          date: "2026-08-03",
          start: 22 * 60,
          end: 1440 + 8 * 60,
          category: "rest",
        }),
      ],
    };
    const stats = computeWeekStats(crossDayData, days);
    const rest = stats.find((s) => s.category === "rest");
    expect(rest).toEqual({
      category: "rest",
      minutes: 10 * 60,
      doneMinutes: 0,
      count: 1,
    });
    const report = buildWeeklyReport(crossDayData, days);
    expect(report).toContain("22:00-24:00");
    expect(report).toContain("00:00-08:00");
  });

  it("无活动记录时不出现活动段", () => {
    const report = buildWeeklyReport(data, days);
    expect(report).not.toContain("活动记录");
  });

  it("有确认记录时在对应日的计划表下追加活动段", () => {
    const withActivities: AppData = {
      ...data,
      activities: [
        {
          id: "a1",
          date: "2026-08-03",
          start: 540,
          end: 630,
          summary: "ZCode 会话 ×2（09:00–10:30）：8 次工具调用",
          category: "work",
          sources: ["zcode"],
          confirmedAt: "2026-09-27T12:00:00+08:00",
        },
        {
          id: "a2",
          date: "2026-08-09",
          summary: "仓库「demo」提交 2 次：feat: x；fix: y",
          category: "work",
          sources: ["git"],
          confirmedAt: "2026-09-27T12:00:00+08:00",
        },
      ],
    };
    const report = buildWeeklyReport(withActivities, days);
    expect(report).toContain("**活动记录（实际）**");
    expect(report).toContain(
      "- 09:00-10:30 [工作] ZCode 会话 ×2（09:00–10:30）：8 次工具调用"
    );
    // 周日只有活动没有计划块，也应有该日小节与无时间前缀的活动行
    expect(report).toContain("## 周日 8/9");
    expect(report).toContain("- [工作] 仓库「demo」提交 2 次：feat: x；fix: y");
  });

  it("周外活动记录不进入本周报", () => {
    const withActivities: AppData = {
      ...data,
      activities: [
        {
          id: "a3",
          date: "2026-08-20",
          summary: "下周的活动",
          category: "work",
          sources: ["zcode"],
          confirmedAt: "2026-09-27T12:00:00+08:00",
        },
      ],
    };
    const report = buildWeeklyReport(withActivities, days);
    expect(report).not.toContain("下周的活动");
  });
});
