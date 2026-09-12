import { addDays, parseDateKey, startOfWeek, toDateKey } from "./date";

export function getBoardStart(
  baseStart: Date,
  earliestDateKey?: string
): Date {
  if (!earliestDateKey) return baseStart;
  const earliest = parseDateKey(earliestDateKey);
  const day = earliest.getDay();
  const earliestMonday = addDays(earliest, day === 0 ? -6 : 1 - day);
  earliestMonday.setHours(0, 0, 0, 0);
  const baseMonday = startOfWeek(baseStart);
  return earliestMonday.getTime() < baseMonday.getTime() ? earliestMonday : baseStart;
}

/** 看板初始最少展示周数（本周起） */
export const BOARD_MIN_WEEKS = 4;
/** 持久化周数上限，防止滚动无限追加撑爆 localStorage 与渲染 */
export const BOARD_MAX_WEEKS = 52;

function toMondayKey(date: Date): string {
  return toDateKey(startOfWeek(date));
}

/**
 * 返回 [boardStart, currentMonday) 区间内每周的周一起始 key（升序）。
 * 即"窗口起点到本周一之间、按周折叠展示的历史周"列表；无历史数据时为空数组。
 */
export function getPastWeekKeys(
  boardStart: Date,
  currentMonday: Date
): string[] {
  const keys: string[] = [];
  let cursor = toMondayKey(boardStart);
  const end = toMondayKey(currentMonday);
  let guard = 0;
  while (cursor < end && guard < BOARD_MAX_WEEKS * 2) {
    keys.push(cursor);
    cursor = toMondayKey(addDays(parseDateKey(cursor), 7));
    guard += 1;
  }
  return keys;
}

/**
 * 决定看板挂载时的折叠周集合。
 * saved === null 表示无本地记录（首次使用），默认折叠本周一之前的所有历史周；
 * saved 为数组（含空数组）时完全以用户保存状态为准，仅过滤无效项
 * （非字符串、早于窗口起点、或不早于本周一的未来周——折叠只作用于历史周语义之外的状态也保留，由调用方决定全集）。
 */
export function resolveInitialCollapsedWeeks(
  boardStart: Date,
  currentMonday: Date,
  saved: string[] | null
): string[] {
  if (saved === null) return getPastWeekKeys(boardStart, currentMonday);
  const startKey = toMondayKey(boardStart);
  return Array.from(
    new Set(
      saved.filter(
        (key): key is string => typeof key === "string" && key >= startKey
      )
    )
  );
}

/**
 * 解析持久化的看板周数：非法值（非有限数、非整数、小于最少周数）回退 BOARD_MIN_WEEKS，
 * 超过上限截断到 BOARD_MAX_WEEKS。
 */
export function resolveBoardWeekCount(
  saved: number | null | undefined
): number {
  if (
    typeof saved !== "number" ||
    !Number.isFinite(saved) ||
    !Number.isInteger(saved) ||
    saved < BOARD_MIN_WEEKS
  ) {
    return BOARD_MIN_WEEKS;
  }
  return Math.min(saved, BOARD_MAX_WEEKS);
}
