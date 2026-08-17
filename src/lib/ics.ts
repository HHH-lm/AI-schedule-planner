import type { TimeBlock } from "./types";
import type { WeekDay } from "./date";
import { parseDateKey } from "./date";
import { CATEGORIES } from "./categories";
import { endDateKey } from "./blockTime";

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;")
    .replace(/\r?\n/g, "\\n");
}

function formatUtcDateTime(dateKey: string, minutes: number): string {
  const localMidnight = parseDateKey(dateKey);
  const localTime = new Date(localMidnight.getTime() + minutes * 60000);
  const utc = new Date(
    localTime.getTime() + localTime.getTimezoneOffset() * 60000
  );
  return `${utc.getUTCFullYear()}${pad(utc.getUTCMonth() + 1)}${pad(
    utc.getUTCDate()
  )}T${pad(utc.getUTCHours())}${pad(utc.getUTCMinutes())}${pad(
    utc.getUTCSeconds()
  )}Z`;
}

function foldLine(line: string): string {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(line);
  if (bytes.length <= 75) return line;
  const chunks: string[] = [];
  let current = "";
  let currentBytes = 0;
  for (const char of line) {
    const charBytes = encoder.encode(char).length;
    if (currentBytes + charBytes > 75 && current) {
      chunks.push(current);
      current = "";
      currentBytes = 0;
    }
    current += char;
    currentBytes += charBytes;
  }
  if (current) chunks.push(current);
  return chunks.join("\r\n ");
}

export function buildWeekICS(blocks: TimeBlock[], days: WeekDay[]): string {
  const weekStart = days[0].key;
  const weekEnd = days[6].key;
  const events = blocks.filter(
    (block) =>
      block.status === "scheduled" &&
      block.date <= weekEnd &&
      endDateKey(block) >= weekStart
  );

  const now = new Date();
  const stamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(
    now.getUTCDate()
  )}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(
    now.getUTCSeconds()
  )}Z`;

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//AI Schedule System//CN",
    "CALSCALE:GREGORIAN",
    "X-WR-CALNAME:AI Schedule",
  ];

  for (const block of events) {
    const descriptionParts = [
      `类别：${CATEGORIES[block.category]?.label ?? block.category}`,
    ];
    if (block.location) descriptionParts.push(`地点：${block.location}`);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${block.id}@ai-schedule`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${formatUtcDateTime(block.date, block.start)}`,
      `DTEND:${formatUtcDateTime(block.date, block.end)}`,
      `SUMMARY:${escapeText(block.name)}`,
      `DESCRIPTION:${escapeText(descriptionParts.join("\n"))}`
    );
    if (block.location) {
      lines.push(`LOCATION:${escapeText(block.location)}`);
    }
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
