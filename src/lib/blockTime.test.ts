import { describe, expect, it } from "vitest";
import {
  blockOverlapsDate,
  blockOverlapsRange,
  dateDiffDays,
  endDateKey,
  endMinutes,
  formatBlockRange,
  MINUTES_PER_DAY,
  splitBlockByDays,
} from "./blockTime";

const overnight = {
  date: "2026-08-03",
  start: 22 * 60,
  end: 22 * 60 + 10 * 60, // 22:00 次日 08:00
};

describe("blockTime 跨天辅助", () => {
  it("endDateKey 按 end 偏移计算结束日期", () => {
    expect(endDateKey({ date: "2026-08-03", start: 0, end: 600 })).toBe(
      "2026-08-03"
    );
    expect(endDateKey(overnight)).toBe("2026-08-04");
    expect(endDateKey({ date: "2026-08-03", start: 0, end: MINUTES_PER_DAY })).toBe(
      "2026-08-04"
    );
    expect(
      endDateKey({ date: "2026-08-03", start: 540, end: 2 * MINUTES_PER_DAY + 600 })
    ).toBe("2026-08-05");
  });

  it("endMinutes 返回结束当天的分钟数", () => {
    expect(endMinutes(overnight)).toBe(8 * 60);
    expect(endMinutes({ date: "2026-08-03", start: 0, end: MINUTES_PER_DAY })).toBe(0);
  });

  it("splitBlockByDays 把跨天块拆成两天分段", () => {
    const segments = splitBlockByDays(overnight);
    expect(segments).toEqual([
      {
        dateKey: "2026-08-03",
        start: 22 * 60,
        end: MINUTES_PER_DAY,
        isStart: true,
        isEnd: false,
      },
      {
        dateKey: "2026-08-04",
        start: 0,
        end: 8 * 60,
        isStart: false,
        isEnd: true,
      },
    ]);
  });

  it("splitBlockByDays 支持多天块", () => {
    const segments = splitBlockByDays({
      date: "2026-08-03",
      start: 540,
      end: 2 * MINUTES_PER_DAY + 600,
    });
    expect(segments.map((s) => s.dateKey)).toEqual([
      "2026-08-03",
      "2026-08-04",
      "2026-08-05",
    ]);
    expect(segments[0]).toMatchObject({ start: 540, end: MINUTES_PER_DAY });
    expect(segments[1]).toMatchObject({ start: 0, end: MINUTES_PER_DAY });
    expect(segments[2]).toMatchObject({ start: 0, end: 600, isEnd: true });
  });

  it("24:00 边界只落在开始日，结束日期为次日", () => {
    const midnight = {
      date: "2026-08-03",
      start: 22 * 60,
      end: MINUTES_PER_DAY,
    };
    expect(endDateKey(midnight)).toBe("2026-08-04");
    expect(splitBlockByDays(midnight)).toEqual([
      {
        dateKey: "2026-08-03",
        start: 22 * 60,
        end: MINUTES_PER_DAY,
        isStart: true,
        isEnd: true,
      },
    ]);
    expect(formatBlockRange(midnight)).toBe("22:00-次日00:00");
  });

  it("blockOverlapsDate 覆盖开始日与结束日", () => {
    expect(blockOverlapsDate(overnight, "2026-08-03")).toBe(true);
    expect(blockOverlapsDate(overnight, "2026-08-04")).toBe(true);
    expect(blockOverlapsDate(overnight, "2026-08-05")).toBe(false);
  });

  it("blockOverlapsRange 判断周范围相交", () => {
    expect(blockOverlapsRange(overnight, "2026-08-03", "2026-08-10")).toBe(true);
    expect(
      blockOverlapsRange(
        { date: "2026-08-09", start: 22 * 60, end: 22 * 60 + 8 * 60 },
        "2026-08-03",
        "2026-08-10"
      )
    ).toBe(true);
    expect(blockOverlapsRange(overnight, "2026-08-05", "2026-08-12")).toBe(false);
  });

  it("dateDiffDays 与时间范围文案", () => {
    expect(dateDiffDays("2026-08-03", "2026-08-05")).toBe(2);
    expect(formatBlockRange(overnight)).toBe("22:00-次日08:00");
    expect(
      formatBlockRange({
        date: "2026-08-03",
        start: 540,
        end: 2 * MINUTES_PER_DAY + 600,
      })
    ).toBe("8/3 09:00-8/5 10:00");
  });
});
