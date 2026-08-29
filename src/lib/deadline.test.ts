import { describe, expect, it } from "vitest";
import {
  extractDeadline,
  formatDeadlineLabel,
  formatDeadlineShort,
  isDeadlineOverdue,
} from "./deadline";

// 固定锚点：2026-08-29（周六）
const ANCHOR = new Date(2026, 7, 29);

describe("extractDeadline", () => {
  it("周X之前：从今天起算下一个匹配日", () => {
    expect(extractDeadline("写报告，周五之前完成", ANCHOR)).toBe("2026-09-04");
  });

  it("下周X之前：加一周", () => {
    expect(extractDeadline("下周五之前交方案", ANCHOR)).toBe("2026-09-11");
  });

  it("今天/明天/大后天之前", () => {
    expect(extractDeadline("今天之内完成", ANCHOR)).toBe("2026-08-29");
    expect(extractDeadline("明天之前提交", ANCHOR)).toBe("2026-08-30");
    expect(extractDeadline("大后天之前要交", ANCHOR)).toBe("2026-09-01");
  });

  it("月日前要交：时间词在前语境在后", () => {
    expect(extractDeadline("9月3号前要交简历", ANCHOR)).toBe("2026-09-03");
  });

  it("截止/最晚在时间词之前", () => {
    expect(extractDeadline("截止9月3号", ANCHOR)).toBe("2026-09-03");
    expect(extractDeadline("最晚9/3提交", ANCHOR)).toBe("2026-09-03");
  });

  it("裸'前'仅紧邻动词时生效", () => {
    expect(extractDeadline("周五前交", ANCHOR)).toBe("2026-09-04");
    expect(extractDeadline("周五前到会议室", ANCHOR)).toBeNull();
  });

  it("完整日期带年份直接使用", () => {
    expect(extractDeadline("2026-12-31之前交付", ANCHOR)).toBe("2026-12-31");
    expect(extractDeadline("2026年9月3日之前", ANCHOR)).toBe("2026-09-03");
  });

  it("无年份月日已过去时顺延一年", () => {
    expect(extractDeadline("1月3号之前完成", ANCHOR)).toBe("2027-01-03");
  });

  it("纯排期表述不误判", () => {
    expect(extractDeadline("周二下午2点到5点写代码", ANCHOR)).toBeNull();
    expect(extractDeadline("9月3号去体检", ANCHOR)).toBeNull();
    expect(extractDeadline("周三上午10点健身", ANCHOR)).toBeNull();
  });

  it("无任何时间表达返回 null", () => {
    expect(extractDeadline("写代码", ANCHOR)).toBeNull();
    expect(extractDeadline("", ANCHOR)).toBeNull();
  });
});

describe("deadline 展示工具", () => {
  it("formatDeadlineShort / formatDeadlineLabel", () => {
    expect(formatDeadlineShort("2026-09-04")).toBe("9/4");
    expect(formatDeadlineLabel("2026-09-04")).toBe("9月4日");
  });

  it("isDeadlineOverdue：截止当天不算逾期", () => {
    expect(isDeadlineOverdue("2026-08-28", ANCHOR)).toBe(true);
    expect(isDeadlineOverdue("2026-08-29", ANCHOR)).toBe(false);
    expect(isDeadlineOverdue("2026-09-04", ANCHOR)).toBe(false);
  });
});
