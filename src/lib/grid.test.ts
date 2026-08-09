import { describe, expect, it } from "vitest";
import { pointToGridSlot } from "./grid";

const days = [
  { key: "2026-08-03" },
  { key: "2026-08-04" },
  { key: "2026-08-05" },
  { key: "2026-08-06" },
  { key: "2026-08-07" },
  { key: "2026-08-08" },
  { key: "2026-08-09" },
];

describe("pointToGridSlot", () => {
  const rect = { left: 100, top: 200 };
  const columnWidth = 132;
  const hourHeight = 48;

  it("按点击位置换算日期列和 15 分钟刻度", () => {
    const x = 100 + 132; // 第二列
    const y = 200 + 9 * hourHeight; // 09:00
    expect(pointToGridSlot(x, y, rect, columnWidth, days, hourHeight)).toEqual({
      date: "2026-08-04",
      start: 9 * 60,
    });
  });

  it("分钟吸附到最近的 15 分钟", () => {
    const x = 100;
    const y = 200 + 9 * hourHeight + 10; // 09:10
    expect(pointToGridSlot(x, y, rect, columnWidth, days, hourHeight)).toEqual({
      date: "2026-08-03",
      start: 9 * 60 + 15,
    });
  });

  it("超出左右边界时钳制到首尾列", () => {
    expect(
      pointToGridSlot(-1000, 200, rect, columnWidth, days, hourHeight)
    ).toEqual({ date: "2026-08-03", start: 0 });
    expect(
      pointToGridSlot(10000, 200, rect, columnWidth, days, hourHeight)
    ).toEqual({ date: "2026-08-09", start: 0 });
  });

  it("超出上下边界时钳制到 0 或 23:59", () => {
    expect(
      pointToGridSlot(100, -1000, rect, columnWidth, days, hourHeight)
    ).toEqual({ date: "2026-08-03", start: 0 });
    expect(
      pointToGridSlot(100, 100000, rect, columnWidth, days, hourHeight)
    ).toEqual({ date: "2026-08-03", start: 1439 });
  });

  it("天数不足时返回 null", () => {
    expect(
      pointToGridSlot(10000, 200, rect, columnWidth, days.slice(0, 3), hourHeight)
    ).toBeNull();
  });
});
