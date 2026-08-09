import { describe, expect, it } from "vitest";
import { resolveSupabaseScope } from "./supabase";

describe("resolveSupabaseScope", () => {
  it("缺少 URL 或 anon key 时禁用云同步", () => {
    expect(resolveSupabaseScope(undefined, "anon-key", "alice")).toEqual({
      enabled: false,
      userId: "",
    });
    expect(resolveSupabaseScope("https://x.supabase.co", undefined, "alice")).toEqual({
      enabled: false,
      userId: "",
    });
  });

  it("未显式配置用户 ID 时禁用云同步，避免共享默认行", () => {
    expect(
      resolveSupabaseScope("https://x.supabase.co", "anon-key", undefined)
    ).toEqual({
      enabled: false,
      userId: "",
    });
  });

  it("完整配置时启用，并返回该用户的隔离作用域", () => {
    expect(
      resolveSupabaseScope("https://x.supabase.co", "anon-key", "alice")
    ).toEqual({
      enabled: true,
      userId: "alice",
    });
  });
});
