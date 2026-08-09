import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  addDays,
  formatWeekRange,
  getWeekDays,
  isoWeekNumber,
  minutesToDuration,
  minutesToHHMM,
  nowMinutes,
  parseDateKey,
  startOfWeek,
  toDateKey,
  todayKey,
  weekdayName,
  weekOffsetForDate,
} from "./date";

const anchor = new Date(2026, 7, 3, 12, 0, 0);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(anchor);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("date key", () => {
  it("toDateKey 与 parseDateKey 往返一致", () => {
    const key = "2026-02-28";
    expect(toDateKey(parseDateKey(key))).toBe(key);
  });

  it("addDays 跨月正确", () => {
    expect(toDateKey(addDays(new Date(2026, 0, 31), 1))).toBe("2026-02-01");
  });
});

describe("week helpers", () => {
  it("startOfWeek 以周一为起点", () => {
    expect(toDateKey(startOfWeek(new Date(2026, 7, 9)))).toBe("2026-08-03");
    expect(toDateKey(startOfWeek(new Date(2026, 7, 5)))).toBe("2026-08-03");
  });

  it("getWeekDays 生成 7 天并标记今天", () => {
    const days = getWeekDays(0, anchor);
    expect(days).toHaveLength(7);
    expect(days.map((d) => d.key)).toEqual([
      "2026-08-03",
      "2026-08-04",
      "2026-08-05",
      "2026-08-06",
      "2026-08-07",
      "2026-08-08",
      "2026-08-09",
    ]);
    expect(days.find((d) => d.key === "2026-08-03")?.isToday).toBe(true);
    expect(days.find((d) => d.key === "2026-08-04")?.isToday).toBe(false);
    expect(getWeekDays(1, anchor)[0].key).toBe("2026-08-10");
  });

  it("formatWeekRange 输出本周区间", () => {
    expect(formatWeekRange(0)).toBe("8月3日 - 8月9日");
  });

  it("weekdayName 与 ISO 周计算稳定", () => {
    expect(weekdayName(new Date(2026, 7, 3))).toBe("周一");
    expect(weekdayName(new Date(2026, 7, 9))).toBe("周日");
    expect(isoWeekNumber(new Date(2026, 0, 1))).toBe(1);
    expect(isoWeekNumber(new Date(2025, 11, 31))).toBe(1);
  });

  it("weekOffsetForDate 计算目标日期所在周", () => {
    expect(weekOffsetForDate("2026-08-04", anchor)).toBe(0);
    expect(weekOffsetForDate("2026-08-09", anchor)).toBe(0);
    expect(weekOffsetForDate("2026-08-10", anchor)).toBe(1);
    expect(weekOffsetForDate("2026-08-11", anchor)).toBe(1);
    expect(weekOffsetForDate("2026-08-17", anchor)).toBe(2);
  });
});

describe("time formatting", () => {
  it("minutesToHHMM 边界与钳制", () => {
    expect(minutesToHHMM(0)).toBe("00:00");
    expect(minutesToHHMM(1439)).toBe("23:59");
    expect(minutesToHHMM(1440)).toBe("23:59");
    expect(minutesToHHMM(-5)).toBe("00:00");
  });

  it("minutesToDuration 输出小时与分钟", () => {
    expect(minutesToDuration(0)).toBe("0分钟");
    expect(minutesToDuration(45)).toBe("45分钟");
    expect(minutesToDuration(60)).toBe("1小时");
    expect(minutesToDuration(90)).toBe("1小时30分");
    expect(minutesToDuration(120)).toBe("2小时");
  });

  it("todayKey 与 nowMinutes 跟随固定时间", () => {
    expect(todayKey()).toBe("2026-08-03");
    expect(nowMinutes()).toBe(12 * 60);
  });
});
