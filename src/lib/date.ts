export function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(d: Date, n: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + n);
  return next;
}

export function startOfWeek(d: Date): Date {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setHours(0, 0, 0, 0);
  return addDays(monday, diff);
}

export interface WeekDay {
  key: string;
  label: string;
  date: Date;
  isToday: boolean;
}

export function getWeekDays(offset: number, anchor = new Date()): WeekDay[] {
  const monday = startOfWeek(anchor);
  const todayKey = toDateKey(anchor);
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(monday, i + offset * 7);
    const key = toDateKey(date);
    const names = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
    return {
      key,
      label: `${names[i]} ${date.getMonth() + 1}/${date.getDate()}`,
      date,
      isToday: key === todayKey,
    };
  });
}

export function weekOffsetForDate(dateKey: string, anchor = new Date()): number {
  const target = parseDateKey(dateKey);
  const monday = startOfWeek(anchor);
  const diffDays = Math.round(
    (target.getTime() - monday.getTime()) / 86400000
  );
  return Math.floor(diffDays / 7);
}

export function formatWeekRange(offset: number): string {
  const days = getWeekDays(offset);
  const first = days[0].date;
  const last = days[6].date;
  return `${first.getMonth() + 1}月${first.getDate()}日 - ${last.getMonth() + 1}月${last.getDate()}日`;
}

export function isoWeekNumber(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

export function minutesToHHMM(minutes: number): string {
  const safe = Math.max(0, Math.min(1439, Math.round(minutes)));
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function minutesToDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}分钟`;
  if (m === 0) return `${h}小时`;
  return `${h}小时${m}分`;
}

export function todayKey(): string {
  return toDateKey(new Date());
}

export function nowMinutes(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

export function weekdayName(date: Date): string {
  return ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][date.getDay()];
}
