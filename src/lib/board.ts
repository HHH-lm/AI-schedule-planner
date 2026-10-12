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
 * 决定看板的折叠周集合。
 *
 * 持久化的是"用户手动展开过的周"（savedExpanded）而不是折叠集合本身：
 * 折叠集合由"当前有哪些历史周"减去"用户展开了哪些"现算得出。因此随着时间推移
 * 新出现的历史周会自动回到默认折叠态，而用户展开过的周刷新后仍保持展开。
 * 早于窗口起点或不在当前历史周范围内的失效 key 天然被基准集合过滤，无需额外分支。
 */
export function resolveCollapsedWeeks(
  boardStart: Date,
  currentMonday: Date,
  savedExpanded: string[] | null
): string[] {
  const expanded = new Set(
    (savedExpanded ?? []).filter((key): key is string => typeof key === "string")
  );
  return getPastWeekKeys(boardStart, currentMonday).filter(
    (key) => !expanded.has(key)
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
