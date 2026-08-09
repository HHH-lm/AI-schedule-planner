import { describe, expect, it } from "vitest";
import { getWeekDays } from "./date";
import { buildWeekICS } from "./ics";
import type { TimeBlock } from "./types";

const days = getWeekDays(0, new Date(2026, 7, 3, 12, 0, 0));

function makeBlock(overrides: Partial<TimeBlock>): TimeBlock {
  return {
    id: "b1",
    name: "事项",
    date: "2026-08-04",
    start: 840,
    end: 1020,
    category: "work",
    done: false,
    status: "scheduled",
    ...overrides,
  };
}

describe("buildWeekICS", () => {
  it("生成日历结构并转义字段", () => {
    const ics = buildWeekICS(
      [
        makeBlock({
          id: "b1",
          name: "写代码, 调试; 修复",
          location: "深圳湾",
        }),
        makeBlock({ id: "b2", name: "待处理", status: "pending" }),
        makeBlock({ id: "b3", name: "下周事项", date: "2026-08-10" }),
      ],
      days
    );

    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("END:VCALENDAR");
    expect(ics).toContain("UID:b1@ai-schedule");
    expect(ics).toContain("SUMMARY:写代码\\, 调试\\; 修复");
    expect(ics).toContain("LOCATION:深圳湾");
    expect(ics).toMatch(/DTSTAMP:\d{8}T\d{6}Z/);
    expect(ics).toMatch(/DTSTART:\d{8}T\d{6}Z/);
    expect(ics).toMatch(/DTEND:\d{8}T\d{6}Z/);
    expect(ics).not.toContain("待处理");
    expect(ics).not.toContain("下周事项");
  });
});
