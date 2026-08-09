import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  detectRejectReason,
  hasMeaningfulName,
  parseScheduleText,
  parseScheduleWithFeedback,
} from "./nlp";

const anchor = new Date(2026, 7, 3, 12, 0, 0);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(anchor);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("hasMeaningfulName", () => {
  it("只认包含字母或中文的事项名", () => {
    expect(hasMeaningfulName("写代码")).toBe(true);
    expect(hasMeaningfulName("abc")).toBe(true);
    expect(hasMeaningfulName("!!!###")).toBe(false);
    expect(hasMeaningfulName("2026")).toBe(false);
    expect(hasMeaningfulName("😀")).toBe(false);
    expect(hasMeaningfulName("未命名事项")).toBe(true);
  });
});

describe("detectRejectReason 纯函数", () => {
  it("无效星期返回 invalid_weekday", () => {
    expect(detectRejectReason("周八开会", anchor)?.code).toBe(
      "invalid_weekday"
    );
  });

  it("只有时间没有事项返回 missing_action", () => {
    expect(detectRejectReason("下午2点到3点", anchor)?.code).toBe(
      "missing_action"
    );
  });

  it("纯符号输入返回 garbage", () => {
    expect(detectRejectReason("!!!###", anchor)?.code).toBe("garbage");
    expect(detectRejectReason("\u0000", anchor)?.code).toBe("garbage");
  });

  it("只有日期没有事项返回 garbage", () => {
    expect(detectRejectReason("明天", anchor)?.code).toBe("garbage");
  });

  it("有效事项不拒绝", () => {
    expect(detectRejectReason("写代码", anchor)).toBeNull();
    expect(detectRejectReason("周二下午2点到4点健身", anchor)).toBeNull();
  });
});

describe("parseScheduleWithFeedback", () => {
  it("全部被拒时返回第一个拒绝原因", () => {
    expect(parseScheduleWithFeedback("！！！", anchor)).toEqual({
      schedules: [],
      rejected: {
        code: "garbage",
        message: "没有识别到有效的时间安排，请输入包含时间和事项的句子",
      },
    });
    expect(parseScheduleWithFeedback("地点深圳湾", anchor).rejected?.code).toBe(
      "detached_location"
    );
  });

  it("空输入返回 empty 拒绝", () => {
    expect(parseScheduleWithFeedback("  ", anchor).rejected?.code).toBe(
      "empty"
    );
  });

  it("部分有效部分无意义时只保留有效块", () => {
    const outcome = parseScheduleWithFeedback("写代码，！！！", anchor);
    expect(outcome.schedules).toHaveLength(1);
    expect(outcome.schedules[0]?.name).toBe("写代码");
    expect(outcome.rejected).toBeNull();
  });

  it("正常输入保持原解析结果", () => {
    const outcome = parseScheduleWithFeedback(
      "周二下午2点到4点健身，地点健身房",
      anchor
    );
    expect(outcome.schedules).toHaveLength(1);
    expect(outcome.schedules[0]?.name).toBe("健身");
    expect(outcome.rejected).toBeNull();
  });
});

describe("parseScheduleText 兼容性", () => {
  it("无意义输入返回空数组", () => {
    expect(parseScheduleText("!!!###", anchor)).toEqual([]);
    expect(parseScheduleText("明天", anchor)).toEqual([]);
    expect(parseScheduleText("周八开会", anchor)).toEqual([]);
  });

  it("无时间但有意义名称仍生成默认块", () => {
    const parsed = parseScheduleText("写代码", anchor);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.start).toBe(9 * 60);
    expect(parsed[0]?.end).toBe(10 * 60);
  });
});
