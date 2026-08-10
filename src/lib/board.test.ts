import { describe, expect, it } from "vitest";
import { getBoardStart } from "./board";

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
