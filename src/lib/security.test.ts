import { describe, expect, it } from "vitest";
import { buildObsidianUrl, parseObsidianUrl } from "./obsidian";

describe("危险输入安全评测", () => {
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
