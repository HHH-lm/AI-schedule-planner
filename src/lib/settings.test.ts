import { describe, expect, it } from "vitest";

import type { AppSettings } from "./types";
import {
  aiApiKeyFor,
  aiRequestFields,
  migrateSettings,
  normalizeAiProvider,
} from "./settings";

describe("normalizeAiProvider", () => {
  it("保留合法 AI 服务商", () => {
    expect(normalizeAiProvider("openai")).toBe("openai");
    expect(normalizeAiProvider("deepseek")).toBe("deepseek");
  });

  it("auto/缺省/非法值归一为本地规则", () => {
    expect(normalizeAiProvider("auto")).toBe("local");
    expect(normalizeAiProvider(undefined)).toBe("local");
    expect(normalizeAiProvider("bogus")).toBe("local");
  });
});

describe("migrateSettings", () => {
  it("存量 auto 迁移为 local 且保留其余字段与 Key", () => {
    const migrated = migrateSettings({
      aiProvider: "auto",
      openaiApiKey: "sk-keep",
      obsidianVault: "vault",
    } as unknown as AppSettings);
    expect(migrated?.aiProvider).toBe("local");
    expect(migrated?.openaiApiKey).toBe("sk-keep");
    expect(migrated?.obsidianVault).toBe("vault");
  });

  it("已合法的设置原样返回（引用不变）", () => {
    const settings = { aiProvider: "deepseek" as const, deepseekApiKey: "k" };
    expect(migrateSettings(settings)).toBe(settings);
  });

  it("无 aiProvider 字段时不改动", () => {
    const settings = { obsidianVault: "v" };
    expect(migrateSettings(settings)).toBe(settings);
  });
});

describe("aiApiKeyFor", () => {
  it("按 provider 取对应 Key 并 trim", () => {
    const settings = { openaiApiKey: " sk-oa ", deepseekApiKey: "sk-ds" };
    expect(aiApiKeyFor("openai", settings)).toBe("sk-oa");
    expect(aiApiKeyFor("deepseek", settings)).toBe("sk-ds");
  });

  it("本地规则与未填 Key 返回 undefined", () => {
    expect(aiApiKeyFor("local", {})).toBeUndefined();
    expect(aiApiKeyFor("deepseek", { deepseekApiKey: "   " })).toBeUndefined();
    expect(aiApiKeyFor("deepseek", undefined)).toBeUndefined();
  });
});

describe("aiRequestFields", () => {
  it("AI 服务商且已填 Key 时携带 api_key", () => {
    expect(
      aiRequestFields({ aiProvider: "deepseek", deepseekApiKey: "sk-ds" })
    ).toEqual({ provider: "deepseek", api_key: "sk-ds" });
  });

  it("未填 Key 时 provider 原样传递、不带 api_key（由后端降级并提示）", () => {
    expect(aiRequestFields({ aiProvider: "deepseek" })).toEqual({
      provider: "deepseek",
    });
  });

  it("存量 auto 归一为 local", () => {
    expect(
      aiRequestFields({ aiProvider: "auto" } as unknown as AppSettings)
    ).toEqual({ provider: "local" });
  });

  it("无设置时默认 local", () => {
    expect(aiRequestFields(undefined)).toEqual({ provider: "local" });
  });
});
