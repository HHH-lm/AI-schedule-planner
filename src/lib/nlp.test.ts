import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseScheduleText, splitSentences } from "./nlp";
import { nlpSamples } from "./__fixtures__/nlp-samples";
import type { ParsedSchedule } from "./types";

const anchor = new Date(2026, 7, 3, 12, 0, 0);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(anchor);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("splitSentences", () => {
  it("按中英文标点拆分并过滤空段", () => {
    expect(splitSentences("写代码，看书；健身。")).toEqual(["写代码", "看书", "健身"]);
  });
});

describe("parseScheduleText 评测样本集", () => {
  it.each(nlpSamples)("$slice: $input", (sample) => {
    const parsed = parseScheduleText(sample.input, anchor);
    const expectedCount = sample.expectedCount ?? 1;
    if (expectedCount === 0) {
      expect(parsed).toEqual([]);
      return;
    }
    expect(parsed.length).toBe(expectedCount);
    const first = parsed[0] as ParsedSchedule;
    for (const [key, value] of Object.entries(sample.expected)) {
      expect(first[key as keyof ParsedSchedule]).toBe(value);
    }
  });
});

describe("parseScheduleText 边界", () => {
  it("空输入返回空数组", () => {
    expect(parseScheduleText("", anchor)).toEqual([]);
    expect(parseScheduleText("  ，； ", anchor)).toEqual([]);
  });
});

describe("周几解析从当前时间向后取最近日期", () => {
  it("周日输入周二解析到下一周的周二", () => {
    const sunday = new Date(2026, 7, 9, 12, 0, 0);
    vi.setSystemTime(sunday);
    const parsed = parseScheduleText("周二下午2点到4点健身", sunday);
    expect(parsed[0]?.date).toBe("2026-08-11");
    expect(parsed[0]?.name).toBe("健身");
    expect(parsed[0]?.start).toBe(14 * 60);
    expect(parsed[0]?.end).toBe(16 * 60);
  });

  it("周一输入周二解析到本周二", () => {
    const monday = new Date(2026, 7, 3, 12, 0, 0);
    vi.setSystemTime(monday);
    const parsed = parseScheduleText("周二上午10点开会", monday);
    expect(parsed[0]?.date).toBe("2026-08-04");
  });

  it("周二当天输入周二解析到今天", () => {
    const tuesday = new Date(2026, 7, 4, 12, 0, 0);
    vi.setSystemTime(tuesday);
    const parsed = parseScheduleText("周二晚上8点吃饭", tuesday);
    expect(parsed[0]?.date).toBe("2026-08-04");
  });
});
