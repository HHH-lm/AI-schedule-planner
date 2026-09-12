import { describe, expect, it } from "vitest";
import {
  BOARD_MAX_WEEKS,
  BOARD_MIN_WEEKS,
  getBoardStart,
  getPastWeekKeys,
  resolveBoardWeekCount,
  resolveInitialCollapsedWeeks,
} from "./board";

const monday = new Date(2026, 7, 3, 12, 0, 0);

describe("getBoardStart", () => {
  it("没有最早日期时使用当前周起点", () => {
    expect(getBoardStart(monday)).toEqual(monday);
  });

  it("最早任务在上周时从上周一保留显示", () => {
    const start = getBoardStart(monday, "2026-07-27");
    expect(start.getDate()).toBe(27);
    expect(start.getDay()).toBe(1);
  });

  it("最早任务在本周时不提前起点", () => {
    const start = getBoardStart(monday, "2026-08-05");
    expect(start).toEqual(monday);
  });

  it("最早任务在未来时不提前起点", () => {
    const start = getBoardStart(monday, "2026-09-01");
    expect(start).toEqual(monday);
  });
});

// 固定"本周一"为 2026-08-03（周一），窗口起点 2026-07-20（两周前周一）
const currentMonday = new Date(2026, 7, 3, 12, 0, 0);
const boardStart = new Date(2026, 6, 20, 12, 0, 0);

describe("getPastWeekKeys", () => {
  it("返回窗口起点到本周一之间的历史周（升序）", () => {
    expect(getPastWeekKeys(boardStart, currentMonday)).toEqual([
      "2026-07-20",
      "2026-07-27",
    ]);
  });

  it("窗口起点就是本周一时没有历史周", () => {
    expect(getPastWeekKeys(currentMonday, currentMonday)).toEqual([]);
  });

  it("起点落在周中也按其所在周一归一", () => {
    const wednesday = new Date(2026, 6, 22, 12, 0, 0);
    expect(getPastWeekKeys(wednesday, currentMonday)).toEqual([
      "2026-07-20",
      "2026-07-27",
    ]);
  });
});

describe("resolveInitialCollapsedWeeks", () => {
  it("无本地记录（null）时默认折叠本周一之前的所有历史周", () => {
    expect(
      resolveInitialCollapsedWeeks(boardStart, currentMonday, null)
    ).toEqual(["2026-07-20", "2026-07-27"]);
  });

  it("无历史数据且无记录时折叠集为空", () => {
    expect(
      resolveInitialCollapsedWeeks(currentMonday, currentMonday, null)
    ).toEqual([]);
  });

  it("有保存记录时完全以保存值为准", () => {
    expect(
      resolveInitialCollapsedWeeks(boardStart, currentMonday, ["2026-07-27"])
    ).toEqual(["2026-07-27"]);
  });

  it("保存为空数组时不折叠任何周", () => {
    expect(resolveInitialCollapsedWeeks(boardStart, currentMonday, [])).toEqual(
      []
    );
  });

  it("过滤早于窗口起点的失效 key", () => {
    expect(
      resolveInitialCollapsedWeeks(boardStart, currentMonday, [
        "2026-07-13",
        "2026-07-20",
      ])
    ).toEqual(["2026-07-20"]);
  });
});

describe("resolveBoardWeekCount", () => {
  it("空值与非整数回退到最少周数", () => {
    expect(resolveBoardWeekCount(null)).toBe(BOARD_MIN_WEEKS);
    expect(resolveBoardWeekCount(undefined)).toBe(BOARD_MIN_WEEKS);
    expect(resolveBoardWeekCount(NaN)).toBe(BOARD_MIN_WEEKS);
    expect(resolveBoardWeekCount(2.5)).toBe(BOARD_MIN_WEEKS);
  });

  it("小于最少周数回退", () => {
    expect(resolveBoardWeekCount(3)).toBe(BOARD_MIN_WEEKS);
  });

  it("合法值原样返回", () => {
    expect(resolveBoardWeekCount(7)).toBe(7);
  });

  it("超过上限截断", () => {
    expect(resolveBoardWeekCount(100)).toBe(BOARD_MAX_WEEKS);
  });
});
