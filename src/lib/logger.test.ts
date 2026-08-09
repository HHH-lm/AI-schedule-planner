import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { logError, logInfo, logWarn } from "./logger";

describe("logger", () => {
  beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("info 事件输出结构化 JSON 日志行", () => {
    logInfo("app_hydrated", { storage: "local" });
    const line = JSON.parse((console.info as ReturnType<typeof vi.fn>).mock.calls[0][0] as string);
    expect(line.level).toBe("info");
    expect(line.event).toBe("app_hydrated");
    expect(line.storage).toBe("local");
    expect(line.time).toBeTruthy();
  });

  it("warn 与 error 事件使用对应控制台通道", () => {
    logWarn("nlp_no_schedule", { inputLength: 3 });
    logError("supabase_save_failed", { userId: "alice" });

    const warnLine = JSON.parse((console.warn as ReturnType<typeof vi.fn>).mock.calls[0][0] as string);
    const errorLine = JSON.parse((console.error as ReturnType<typeof vi.fn>).mock.calls[0][0] as string);
    expect(warnLine.level).toBe("warn");
    expect(warnLine.event).toBe("nlp_no_schedule");
    expect(errorLine.level).toBe("error");
    expect(errorLine.userId).toBe("alice");
  });
});
