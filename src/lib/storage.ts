import type { AppData } from "./types";

const STORAGE_KEY = "ai-schedule-data-v1";

export function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function loadLocalData(): AppData | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AppData;
    if (!parsed || !Array.isArray(parsed.tasks) || !Array.isArray(parsed.timeBlocks)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveLocalData(data: AppData): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // 本地存储满或不可用时静默失败，MVP 阶段不影响演示
  }
}
