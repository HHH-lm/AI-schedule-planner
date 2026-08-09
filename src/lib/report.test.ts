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
});
