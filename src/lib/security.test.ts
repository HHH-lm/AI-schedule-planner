import { describe, expect, it } from "vitest";
import { parseScheduleText } from "./nlp";
import { buildObsidianUrl, parseObsidianUrl } from "./obsidian";

const anchor = new Date(2026, 7, 3, 12, 0, 0);

describe("危险输入安全评测", () => {
  it.each([
    "<script>alert(1)</script>",
    "<img src=x onerror=alert(1)>",
    "<svg/onload=alert(1)>",
    "'; DROP TABLE schedule_state;--",
    "javascript:alert(1)",
  ])("注入样本不导致解析器崩溃或执行：%s", (input) => {
    const parsed = parseScheduleText(input, anchor);
    expect(Array.isArray(parsed)).toBe(true);
    for (const item of parsed) {
      expect(typeof item.name).toBe("string");
      expect(typeof item.date).toBe("string");
    }
  });

  it("超长输入不导致解析器异常", () => {
    const input = "写代码".repeat(1600);
    const parsed = parseScheduleText(input, anchor);
    expect(Array.isArray(parsed)).toBe(true);
  });

  it("控制字符与纯符号输入按数据流处理，不抛异常", () => {
    expect(() => parseScheduleText("\u0000", anchor)).not.toThrow();
    expect(() => parseScheduleText("!!!###", anchor)).not.toThrow();
  });

  it("Obsidian 链接协议白名单拒绝非 obsidian 协议", () => {
    expect(parseObsidianUrl("javascript:alert(1)")).toEqual({});
    expect(parseObsidianUrl("data:text/html,<script>alert(1)</script>")).toEqual({});
  });

  it("Obsidian URL 参数使用 URL 编码，阻止参数注入", () => {
    const url = buildObsidianUrl('vault"#x', 'note"&file=../x');
    expect(url).not.toContain('vault"');
    expect(url).not.toContain('"');
    expect(url).toContain("%22");
    expect(url).toContain("%23");
  });
});
