import type { AppData, TimeBlock, WeekStat } from "./types";
import type { WeekDay } from "./date";
import { CATEGORIES, CATEGORY_ORDER } from "./categories";
import { isoWeekNumber, minutesToDuration, minutesToHHMM } from "./date";

const WEEKDAY_LABELS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

export function computeWeekStats(data: AppData, days: WeekDay[]): WeekStat[] {
  const keys = new Set(days.map((d) => d.key));
  return CATEGORY_ORDER.map((category) => {
    let minutes = 0;
    let doneMinutes = 0;
    let count = 0;
    for (const block of data.timeBlocks) {
      if (block.status !== "scheduled" || !keys.has(block.date) || block.category !== category) continue;
      const duration = Math.max(0, block.end - block.start);
      minutes += duration;
      if (block.done) doneMinutes += duration;
      count += 1;
    }
    return { category, minutes, doneMinutes, count };
  }).filter((stat) => stat.minutes > 0 || stat.count > 0);
}

function blocksForDay(data: AppData, dayKey: string): TimeBlock[] {
  return data.timeBlocks
    .filter((b) => b.date === dayKey && b.status === "scheduled")
    .sort((a, b) => a.start - b.start);
}

function buildTimeDistributionTable(data: AppData, days: WeekDay[]): string {
  const slots = [
    ["00:00-06:00", "凌晨"],
    ["06:00-09:00", "清晨"],
    ["09:00-12:00", "上午"],
    ["12:00-14:00", "中午"],
    ["14:00-18:00", "下午"],
    ["18:00-22:00", "晚上"],
    ["22:00-24:00", "深夜"],
  ];
  const slotRanges = [
    [0, 360],
    [360, 540],
    [540, 720],
    [720, 840],
    [840, 1080],
    [1080, 1320],
    [1320, 1440],
  ];
  const header = ["时段", ...days.map((d) => d.label.split(" ")[0])].join(" | ");
  const separator = ["---", ...days.map(() => "---")].join(" | ");
  const rows: string[] = [];
  slots.forEach((slot, index) => {
    const cells = [slot[1]];
    for (const day of days) {
      const dayBlocks = blocksForDay(data, day.key).filter(
        (b) => b.start < slotRanges[index][1] && b.end > slotRanges[index][0]
      );
      const summary = dayBlocks
        .map((b) => `${CATEGORIES[b.category].label}${Math.round((Math.min(b.end, slotRanges[index][1]) - Math.max(b.start, slotRanges[index][0])) / 60)}h`)
        .join("、");
      cells.push(summary || "-");
    }
    rows.push(cells.join(" | "));
  });
  return `| ${header} |\n| ${separator} |\n${rows.map((r) => `| ${r} |`).join("\n")}`;
}

export function buildWeeklyReport(data: AppData, days: WeekDay[]): string {
  const stats = computeWeekStats(data, days);
  const totalMinutes = stats.reduce((sum, s) => sum + s.minutes, 0);
  const first = days[0];
  const last = days[6];

  const lines: string[] = [];
  lines.push(`# 本周日程复盘（${first.date.getMonth() + 1}月${first.date.getDate()}日 - ${last.date.getMonth() + 1}月${last.date.getDate()}日，第${isoWeekNumber(first.date)}周）`);
  lines.push("");
  lines.push("## 时间统计");
  lines.push("");
  lines.push("| 类目 | 时长 | 占比 | 完成 | 事件数 |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const stat of stats) {
    const ratio = totalMinutes > 0 ? `${Math.round((stat.minutes / totalMinutes) * 100)}%` : "-";
    const done = stat.doneMinutes > 0 ? `${minutesToDuration(stat.doneMinutes)}` : "-";
    lines.push(`| ${CATEGORIES[stat.category].label} | ${minutesToDuration(stat.minutes)} | ${ratio} | ${done} | ${stat.count} |`);
  }
  if (totalMinutes > 0) lines.push(`| **合计** | **${minutesToDuration(totalMinutes)}** | 100% | - | - |`);
  lines.push("");
  lines.push("## 24 小时时间分布");
  lines.push("");
  lines.push(buildTimeDistributionTable(data, days));
  lines.push("");

  for (let i = 0; i < days.length; i += 1) {
    const dayBlocks = blocksForDay(data, days[i].key);
    if (dayBlocks.length === 0) continue;
    lines.push(`## ${WEEKDAY_LABELS[i]} ${days[i].label.split(" ")[1]}`);
    lines.push("");
    lines.push("| 时间 | 事项 | 类目 | 地点 | 状态 |");
    lines.push("| --- | --- | --- | --- | --- |");
    for (const block of dayBlocks) {
      const location = block.location || "-";
      const status = block.done ? "完成" : "待办";
      lines.push(
        `| ${minutesToHHMM(block.start)}-${minutesToHHMM(block.end)} | ${block.name} | ${CATEGORIES[block.category].label} | ${location} | ${status} |`
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}
