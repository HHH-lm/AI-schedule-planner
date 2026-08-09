import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadLocalData, saveLocalData, uid } from "./storage";
import type { AppData } from "./types";

class MockStorage {
  private map = new Map<string, string>();

  get length(): number {
    return this.map.size;
  }

  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
  }

  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null;
  }
}

function makeData(): AppData {
  return { version: 1, tasks: [], timeBlocks: [] };
}

beforeEach(() => {
  const mock = new MockStorage();
  vi.stubGlobal("window", { localStorage: mock });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("localStorage 持久化", () => {
  it("保存后可以读回", () => {
    const data = makeData();
    saveLocalData(data);
    expect(loadLocalData()).toEqual(data);
  });

  it("无数据时返回 null", () => {
    expect(loadLocalData()).toBeNull();
  });

  it("损坏 JSON 返回 null 且不抛出", () => {
    const windowMock = window as unknown as { localStorage: { setItem: (k: string, v: string) => void } };
    windowMock.localStorage.setItem("ai-schedule-data-v1", "{bad json");
    expect(loadLocalData()).toBeNull();
  });

  it("结构不完整时返回 null", () => {
    const windowMock = window as unknown as { localStorage: { setItem: (k: string, v: string) => void } };
    windowMock.localStorage.setItem("ai-schedule-data-v1", JSON.stringify({ version: 1 }));
    expect(loadLocalData()).toBeNull();
  });
});

describe("uid", () => {
  it("连续生成不同 ID", () => {
    expect(uid()).not.toBe(uid());
  });
});

describe("无 window 环境", () => {
  it("读写安全返回", () => {
    vi.stubGlobal("window", undefined);
    expect(loadLocalData()).toBeNull();
    expect(saveLocalData(makeData())).toBeUndefined();
  });
});
