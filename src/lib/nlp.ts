import type { Category, ParsedSchedule } from "./types";
import { guessCategory } from "./categories";
import { addDays, toDateKey } from "./date";

type TimeModifier = "" | "凌晨" | "早上" | "早晨" | "上午" | "中午" | "下午" | "傍晚" | "晚上";

const WEEKDAY_INDEX: Record<string, number> = {
  一: 0,
  二: 1,
  三: 2,
  四: 3,
  五: 4,
  六: 5,
  日: 6,
  天: 6,
};

function normalizeTimeNotation(text: string): string {
  return text
    .replace(/(\d{1,2})\s*点/g, "$1点")
    .replace(/(\d{1,2})点半/g, "$1:30")
    .replace(/(\d{1,2})点(\d{1,2})分/g, "$1:$2")
    .replace(/(\d{1,2})点(\d{1,2})/g, "$1:$2");
}

function parseClock(hourText: string, minuteText: string | undefined, modifier: TimeModifier): number {
  let hour = Number(hourText);
  if ((modifier === "下午" || modifier === "晚上" || modifier === "傍晚") && hour < 12) {
    hour += 12;
  }
  if (modifier === "凌晨" && hour === 12) hour = 0;
  const minute = minuteText ? Number(minuteText) : 0;
  return Math.max(0, Math.min(1439, hour * 60 + minute));
}

function matchTimeRange(segment: string): { start: number; end: number; raw: string } | null {
  const normalized = normalizeTimeNotation(segment);
  const pattern =
    /(凌晨|早上|早晨|上午|中午|下午|傍晚|晚上)?\s*(\d{1,2})(?:[:：点](?:(\d{1,2}))?)?\s*[到至~\-—–]\s*(凌晨|早上|早晨|上午|中午|下午|傍晚|晚上)?\s*(\d{1,2})(?:[:：点](?:(\d{1,2}))?)?/;
  const match = normalized.match(pattern);
  if (!match) return null;
  const start = parseClock(match[2], match[3], (match[1] as TimeModifier) ?? "");
  const endModifier = ((match[4] as TimeModifier) || (match[1] as TimeModifier) || "") as TimeModifier;
  const end = parseClock(match[5], match[6], endModifier);
  return { start, end: Math.max(start + 15, end), raw: match[0] };
}

function matchSingleTime(segment: string): { start: number; end: number; raw: string } | null {
  const normalized = normalizeTimeNotation(segment);
  const pattern = /(凌晨|早上|早晨|上午|中午|下午|傍晚|晚上)\s*(\d{1,2})(?:[:：点](?:(\d{1,2}))?)?/;
  const match = normalized.match(pattern);
  if (!match) return null;
  const start = parseClock(match[2], match[3], match[1] as TimeModifier);
  return { start, end: start + 60, raw: match[0] };
}

function nextWeekdayDate(weekdayIndex: number, anchor: Date): Date {
  const todayIndex = (anchor.getDay() + 6) % 7;
  const offset = (weekdayIndex - todayIndex + 7) % 7;
  return addDays(anchor, offset);
}

function findDate(segment: string, anchor: Date): { key: string; raw: string } | null {
  const weekdayMatch = segment.match(/(?:周|星期)([一二三四五六日天])/);
  if (weekdayMatch) {
    const index = WEEKDAY_INDEX[weekdayMatch[1]];
    return { key: toDateKey(nextWeekdayDate(index, anchor)), raw: weekdayMatch[0] };
  }
  if (/今天/.test(segment)) {
    return { key: toDateKey(anchor), raw: "今天" };
  }
  if (/明天/.test(segment)) {
    return { key: toDateKey(addDays(anchor, 1)), raw: "明天" };
  }
  return null;
}

function findLocation(segment: string): string | undefined {
  const match = segment.match(/(?:地点[:：]?|在|去)([\u4e00-\u9fa5A-Za-z0-9]{1,10})$/);
  if (!match) return undefined;
  const candidate = match[1];
  if (/^(今天|明天|上午|下午|晚上|中午|早上)$/.test(candidate)) return undefined;
  return candidate;
}

function extractDetachedLocation(segment: string): string | undefined {
  const trimmed = segment.trim();
  const location = findLocation(trimmed);
  if (!location) return undefined;
  const rest = trimmed.replace(new RegExp(`(?:地点[:：]?|在|去)${location}$`), "").trim();
  return rest ? undefined : location;
}

function cleanName(segment: string): string {
  const cleaned = segment
    .replace(/，|。|；|；|,|;|\.$/, "")
    .replace(/^[\s,，。；;]+|[\s,，。；;]+$/g, "")
    .trim();
  return cleaned || "未命名事项";
}

export function splitSentences(text: string): string[] {
  return text
    .split(/[，,。；;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function parseScheduleText(text: string, anchor = new Date()): ParsedSchedule[] {
  const result: ParsedSchedule[] = [];
  for (const rawSegment of splitSentences(text)) {
    const location = extractDetachedLocation(rawSegment);
    if (location) {
      const previous = result[result.length - 1];
      if (previous) {
        previous.location = previous.location ?? location;
      }
      continue;
    }
    const parsed = parseSegment(rawSegment, anchor);
    if (parsed) result.push(parsed);
  }
  return result;
}

function parseSegment(rawSegment: string, anchor: Date): ParsedSchedule | null {
  let segment = rawSegment.trim();
  if (!segment) return null;

  const dateInfo = findDate(segment, anchor);
  const date = dateInfo?.key ?? toDateKey(anchor);

  const normalizedSegment = normalizeTimeNotation(segment);
  const range = matchTimeRange(normalizedSegment) ?? matchSingleTime(normalizedSegment);
  const start = range?.start ?? 9 * 60;
  const end = range?.end ?? start + 60;

  let remaining = normalizedSegment;
  if (range) remaining = remaining.replace(range.raw, "");
  if (dateInfo) remaining = remaining.replace(dateInfo.raw, "");

  const location = findLocation(remaining);
  if (location) remaining = remaining.replace(new RegExp(`(?:地点[:：]?|在|去)${location}$`), "");

  const name = cleanName(remaining);
  const category: Category = guessCategory(`${rawSegment} ${name}`);

  return { name, date, start, end, category, location };
}
