import { describe, expect, it } from "vitest";
import { buildObsidianUrl, parseObsidianUrl } from "./obsidian";

describe("buildObsidianUrl", () => {
  it("生成只带 vault 的跳转链接", () => {
    expect(buildObsidianUrl("AI日程")).toBe(
      "obsidian://open?vault=AI%E6%97%A5%E7%A8%8B"
    );
  });

  it("附带笔记路径并保留中文", () => {
    expect(buildObsidianUrl("AI日程", "项目/写AI应用文章")).toBe(
      "obsidian://open?vault=AI%E6%97%A5%E7%A8%8B&file=%E9%A1%B9%E7%9B%AE%2F%E5%86%99AI%E5%BA%94%E7%94%A8%E6%96%87%E7%AB%A0"
    );
  });
});

describe("parseObsidianUrl", () => {
  it("解析粘贴的 Obsidian 链接", () => {
    expect(
      parseObsidianUrl(
        "obsidian://open?vault=H&file=AI%E6%97%A5%E7%A8%8B/test"
      )
    ).toEqual({ vault: "H", file: "AI日程/test" });
  });

  it("无 file 时只返回 vault", () => {
    expect(parseObsidianUrl("obsidian://open?vault=H")).toEqual({
      vault: "H",
    });
  });

  it("普通文本或空输入返回空对象", () => {
    expect(parseObsidianUrl("AI日程")).toEqual({});
    expect(parseObsidianUrl("/Users/h/Notes")).toEqual({});
    expect(parseObsidianUrl("")).toEqual({});
  });
});
