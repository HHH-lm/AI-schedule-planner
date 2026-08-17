import { addDays, minutesToHHMM, parseDateKey, toDateKey } from "./date";

export const MINUTES_PER_DAY = 1440;

export interface TimeRange {
  date: string;
  start: number;
  end: number;
}

export interface DaySegment {
  dateKey: string;
  start: number;
  end: number;
  isStart: boolean;
  isEnd: boolean;
}

export function endDateKey(range: TimeRange): string {
  const dayOffset = Math.floor(Math.max(0, range.end) / MINUTES_PER_DAY);
  return toDateKey(addDays(parseDateKey(range.date), dayOffset));
}

export function endMinutes(range: TimeRange): number {
  return Math.max(0, range.end) % MINUTES_PER_DAY;
}

export function dateDiffDays(fromKey: string, toKey: string): number {
  const from = parseDateKey(fromKey).getTime();
  const to = parseDateKey(toKey).getTime();
  return Math.round((to - from) / 86400000);
}

export function blockOverlapsDate(
  range: TimeRange,
  dateKey: string
): boolean {
  return range.date <= dateKey && dateKey <= endDateKey(range);
}

export function blockOverlapsRange(
  range: TimeRange,
  startKey: string,
  endKeyExclusive: string
): boolean {
  return range.date < endKeyExclusive && endDateKey(range) >= startKey;
}

export function splitBlockByDays(range: TimeRange): DaySegment[] {
  const segments: DaySegment[] = [];
  const endKey = endDateKey(range);
  let currentKey = range.date;
  let currentStart = Math.max(0, range.start);
  while (currentKey <= endKey) {
    const isEnd = currentKey === endKey;
    const currentEnd = isEnd ? endMinutes(range) : MINUTES_PER_DAY;
    if (currentStart < currentEnd) {
      segments.push({
        dateKey: currentKey,
        start: currentStart,
        end: currentEnd,
        isStart: currentKey === range.date,
        isEnd,
      });
    }
    currentKey = toDateKey(addDays(parseDateKey(currentKey), 1));
    currentStart = 0;
  }
  if (segments.length > 0) {
    segments[segments.length - 1].isEnd = true;
  }
  return segments;
}

function shortDateKey(dateKey: string): string {
  const [, month, day] = dateKey.split("-").map(Number);
  return `${month}/${day}`;
}

export function formatBlockRange(range: TimeRange): string {
  const startTime = minutesToHHMM(range.start);
  const endKey = endDateKey(range);
  const endTime = minutesToHHMM(endMinutes(range));
  const dayDiff = dateDiffDays(range.date, endKey);
  if (dayDiff <= 0) return `${startTime}-${endTime}`;
  if (dayDiff === 1) return `${startTime}-次日${endTime}`;
  return `${shortDateKey(range.date)} ${startTime}-${shortDateKey(endKey)} ${endTime}`;
}
