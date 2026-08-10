import { addDays, parseDateKey, startOfWeek } from "./date";

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
