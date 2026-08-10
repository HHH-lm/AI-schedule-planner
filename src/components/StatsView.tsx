"use client";

import { useMemo, useState } from "react";
import { CheckCheck, ClipboardCopy, Download, FileText, Hourglass, Timer, TrendingUp } from "lucide-react";
import type { AppData } from "@/lib/types";
import type { WeekDay } from "@/lib/date";
import { CATEGORIES } from "@/lib/categories";
import { buildWeeklyReport, computeWeekStats } from "@/lib/report";
import { isoWeekNumber, minutesToDuration } from "@/lib/date";

interface Props {
  data: AppData;
  days: WeekDay[];
}

export default function StatsView({ data, days }: Props) {
  const [copied, setCopied] = useState(false);
  const [downloaded, setDownloaded] = useState(false);

  const stats = useMemo(() => computeWeekStats(data, days), [data, days]);
  const totalMinutes = stats.reduce((sum, stat) => sum + stat.minutes, 0);
  const doneMinutes = stats.reduce((sum, stat) => sum + stat.doneMinutes, 0);
  const scheduledCount = data.timeBlocks.filter(
    (block) => block.status === "scheduled" && days.some((d) => d.key === block.date)
  ).length;
  const pendingCount = data.timeBlocks.filter(
    (block) => block.status === "pending" && days.some((d) => d.key === block.date)
  ).length;
  const completionRate =
    totalMinutes > 0 ? Math.round((doneMinutes / totalMinutes) * 100) : 0;

  const report = useMemo(
    () => buildWeeklyReport(data, days),
    [data, days]
  );

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      // 剪贴板不可用时用户仍可下载文件
    }
  };

  const handleDownload = () => {
    const blob = new Blob([report], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `周报-第${isoWeekNumber(days[0].date)}周.md`;
    link.click();
    URL.revokeObjectURL(url);
    setDownloaded(true);
    window.setTimeout(() => setDownloaded(false), 2500);
  };

  const tiles = [
    {
      label: "本周投入",
      value: minutesToDuration(totalMinutes),
      icon: Timer,
    },
    {
      label: "完成时长",
      value: `${minutesToDuration(doneMinutes)} · ${completionRate}%`,
      icon: CheckCheck,
    },
    {
      label: "本周时间块",
      value: `${scheduledCount} 个`,
      icon: TrendingUp,
    },
    {
      label: "待排期",
      value: `${pendingCount} 个`,
      icon: Hourglass,
    },
  ];

  return (
    <div className="flex-1 space-y-4 overflow-y-auto thin-scroll">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {tiles.map((tile) => {
          const Icon = tile.icon;
          return (
            <div
              key={tile.label}
              className="tool-panel !p-5"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-ink-muted-48">{tile.label}</span>
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[rgba(0,102,204,0.08)] text-primary">
                  <Icon size={15} />
                </span>
              </div>
              <div className="mt-2 text-lg font-semibold text-ink">
                {tile.value}
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="tool-panel">
          <h3 className="type-caption-strong text-ink">类目时长统计</h3>
          <div className="mt-3 space-y-3">
            {stats.length === 0 && (
              <p className="text-sm text-ink-muted-48">本周还没有时间块</p>
            )}
            {stats.map((stat) => {
              const meta = CATEGORIES[stat.category];
              const ratio =
                totalMinutes > 0 ? Math.round((stat.minutes / totalMinutes) * 100) : 0;
              return (
                <div key={stat.category}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="flex items-center gap-1.5 font-medium text-ink-muted-80">
                      <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
                      {meta.label}
                    </span>
                    <span className="text-ink-muted-48">
                      {minutesToDuration(stat.minutes)} · {ratio}%
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-[#f0f0f0]">
                    <div
                      className={`h-full rounded-full ${meta.solid}`}
                      style={{ width: `${ratio}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="tool-panel">
          <h3 className="type-caption-strong text-ink">周完成率</h3>
          <div className="mt-3 flex items-center gap-4">
            <div className="relative h-20 w-20 shrink-0">
              <svg viewBox="0 0 80 80" className="h-20 w-20 -rotate-90">
                <circle cx="40" cy="40" r="34" fill="none" stroke="#f0f0f0" strokeWidth="9" />
                <circle
                  cx="40"
                  cy="40"
                  r="34"
                  fill="none"
                  stroke="#0066cc"
                  strokeWidth="9"
                  strokeLinecap="round"
                  strokeDasharray={`${(completionRate / 100) * 213.6} 213.6`}
                />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-ink">
                {completionRate}%
              </span>
            </div>
            <div className="text-sm leading-6 text-ink-muted-48">
              <div>完成：{minutesToDuration(doneMinutes)}</div>
              <div>总投入：{minutesToDuration(totalMinutes)}</div>
              <div>待完成：{minutesToDuration(Math.max(0, totalMinutes - doneMinutes))}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="tool-panel">
        <h3 className="type-caption-strong text-ink">本周 24 小时分布</h3>
        <div className="mt-4 space-y-2">
          {days.map((day) => {
            const dayBlocks = data.timeBlocks
              .filter(
                (block) =>
                  block.status === "scheduled" && block.date === day.key
              )
              .sort((a, b) => a.start - b.start);
            return (
              <div key={day.key} className="flex items-center gap-2">
                <span className="w-14 shrink-0 text-xs text-ink-muted-48">
                  {day.label.split(" ")[0]}
                </span>
                <div className="relative h-6 flex-1 overflow-hidden rounded-[6px] bg-[#f5f5f7]">
                  {dayBlocks.map((block) => (
                    <div
                      key={block.id}
                      className="absolute top-0 h-full rounded-sm"
                      style={{
                        left: `${(block.start / 1440) * 100}%`,
                        width: `${Math.max(1, ((block.end - block.start) / 1440) * 100)}%`,
                        backgroundColor: CATEGORIES[block.category].soft,
                        borderLeft: `3px solid ${CATEGORIES[block.category].solid}`,
                      }}
                      title={`${block.name} ${block.start / 60}:00`}
                    />
                  ))}
                </div>
              </div>
            );
          })}
          <div className="mt-1 flex items-center gap-2">
            <span className="w-14 shrink-0" />
            <div className="relative flex-1">
              {[0, 6, 12, 18, 24].map((hour) => (
                <span
                  key={hour}
                  className="absolute -translate-x-1/2 text-[10px] text-ink-muted-48"
                  style={{ left: `${(hour / 24) * 100}%` }}
                >
                  {hour}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="tool-panel">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <FileText size={16} className="text-ink-muted-48" />
            <h3 className="type-caption-strong text-ink">Obsidian 周报</h3>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium ${
                copied
                  ? "status-note-ok !border !py-1.5"
                  : "btn-ghost"
              }`}
            >
              {copied ? <CheckCheck size={14} /> : <ClipboardCopy size={14} />}
              {copied ? "已复制" : "复制"}
            </button>
            <button
              type="button"
              onClick={handleDownload}
              className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium ${
                downloaded
                  ? "status-note-ok !border !py-1.5"
                  : "btn-ghost"
              }`}
            >
              <Download size={14} />
              {downloaded ? "已下载" : "下载 .md"}
            </button>
          </div>
        </div>
        <div className="mt-3 max-h-64 overflow-y-auto rounded-[8px] bg-[#f5f5f7] p-3 font-mono text-[11px] leading-5 text-ink-muted-80 thin-scroll">
          {report}
        </div>
      </div>

    </div>
  );
}
