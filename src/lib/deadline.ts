import { toDateKey } from "./date";

/**
 * 从中文自然语言中提取"截止日期"。
 * 必须出现截止语境词（之前/以前/截止/最晚/之内等）才生效，
 * 避免把"周二下午2点到5点写代码""9月3号去体检"这类纯排期表述误判为截止。
 */

const WEEKDAY_INDEX: Record<string, number> = {
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  日: 0,
  天: 0,
};

// 时间表达（按最长优先）：完整日期 → 月日 → M/D → M-D → 相对日 → [本|下]周X
// 编号捕获组：1-3 完整日期 / 4-5 月日 / 6-7 M/D / 8-9 M-D / 10 相对日 / 11 前缀 / 12 周几
const TIME_EXPR =
  /(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})日?|(\d{1,2})月(\d{1,2})[日号]|(\d{1,2})\/(\d{1,2})(?!\d|[月日号点])|(\d{1,2})-(\d{1,2})(?!\d|[月日号点])|(大后天|后天|明天|今天)|(本|下个|下)?(?:周|星期)([一二三四五六日天])/g;

// 时间词之后的截止语境：之前/以前/以内/之内/为止，或紧邻的"前"+动词
const AFTER_CONTEXT =
  /(?:之前|以前|以内|之内|为止)|前(?=[要完交结做搞止给])/;
// 时间词之前的截止语境：截止（到/于）、最晚、最迟、期限等
const BEFORE_CONTEXT =
  /截止(?:到|于|日)?|最晚|最迟|限期|期限|不得晚于|不晚于|[dD][dD][lL]/;

const CONTEXT_WINDOW = 6;

interface TimeMatch {
  start: number;
  end: number;
  resolve: (today: Date) => Date | null;
}

function buildDate(year: number, month: number, day: number): Date | null {
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

/** 无年份的月日：默认当年，已过去则顺延一年（截止日期必须在未来） */
function resolveMonthDay(
  month: number,
  day: number,
  today: Date
): Date | null {
  const current = buildDate(today.getFullYear(), month, day);
  if (!current) return null;
  const todayStart = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  );
  if (current.getTime() < todayStart.getTime()) {
    return buildDate(today.getFullYear() + 1, month, day);
  }
  return current;
}

function collectTimeMatches(text: string): TimeMatch[] {
  const matches: TimeMatch[] = [];
  for (const match of text.matchAll(TIME_EXPR)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    if (match[1] !== undefined) {
      const year = Number(match[1]);
      const month = Number(match[2]);
      const day = Number(match[3]);
      matches.push({ start, end, resolve: () => buildDate(year, month, day) });
    } else if (match[4] !== undefined) {
      const month = Number(match[4]);
      const day = Number(match[5]);
      matches.push({
        start,
        end,
        resolve: (today) => resolveMonthDay(month, day, today),
      });
    } else if (match[6] !== undefined) {
      const month = Number(match[6]);
      const day = Number(match[7]);
      matches.push({
        start,
        end,
        resolve: (today) => resolveMonthDay(month, day, today),
      });
    } else if (match[8] !== undefined) {
      const month = Number(match[8]);
      const day = Number(match[9]);
      matches.push({
        start,
        end,
        resolve: (today) => resolveMonthDay(month, day, today),
      });
    } else if (match[10] !== undefined) {
      const offset = { 今天: 0, 明天: 1, 后天: 2, 大后天: 3 }[match[10]] ?? 0;
      matches.push({
        start,
        end,
        resolve: (today) => {
          const date = new Date(
            today.getFullYear(),
            today.getMonth(),
            today.getDate() + offset
          );
          return Number.isNaN(date.getTime()) ? null : date;
        },
      });
    } else if (match[12] !== undefined) {
      const target = WEEKDAY_INDEX[match[12]];
      const plusWeek = match[11] === "下" || match[11] === "下个" ? 7 : 0;
      matches.push({
        start,
        end,
        resolve: (today) => {
          // 与后端 NLP 一致：从今天起算下一个匹配日（含今天）
          const offset = ((target - today.getDay() + 7) % 7) + plusWeek;
          const date = new Date(
            today.getFullYear(),
            today.getMonth(),
            today.getDate() + offset
          );
          return Number.isNaN(date.getTime()) ? null : date;
        },
      });
    }
  }
  return matches;
}

/**
 * 提取截止日期（YYYY-MM-DD），无截止语境时返回 null。
 * 多个候选时取第一个带截止语境的时间表达。
 */
export function extractDeadline(
  text: string,
  today: Date = new Date()
): string | null {
  if (!text) return null;
  for (const match of collectTimeMatches(text)) {
    const windowStart = Math.max(0, match.start - CONTEXT_WINDOW);
    const windowEnd = Math.min(text.length, match.end + CONTEXT_WINDOW);
    const window = text.slice(windowStart, windowEnd);
    if (!AFTER_CONTEXT.test(window) && !BEFORE_CONTEXT.test(window)) {
      continue;
    }
    const resolved = match.resolve(today);
    if (resolved) return toDateKey(resolved);
  }
  return null;
}

/** 截止日期短格式，用于徽标："9/4" */
export function formatDeadlineShort(deadline: string): string {
  const [, month, day] = deadline.split("-").map(Number);
  return `${month}/${day}`;
}

/** 截止日期展示格式："9月4日" */
export function formatDeadlineLabel(deadline: string): string {
  const [, month, day] = deadline.split("-").map(Number);
  return `${month}月${day}日`;
}

/** 截止日期是否已逾期（截止当天不算逾期） */
export function isDeadlineOverdue(
  deadline: string,
  today: Date = new Date()
): boolean {
  return deadline < toDateKey(today);
}
