"use client";

import { useMemo, useState } from "react";
import { CheckCheck, ClipboardCopy, ClipboardList, Download, FileText, Hourglass, Radar, Timer, TrendingUp } from "lucide-react";
import type { Activity, AppData, Category } from "@/lib/types";
import type { WeekDay } from "@/lib/date";
import { CATEGORIES, CATEGORY_ORDER } from "@/lib/categories";
import { buildWeeklyReport, computeWeekStats, activitiesForDay } from "@/lib/report";
import { isoWeekNumber, minutesToDuration } from "@/lib/date";
import { blockOverlapsDate, splitBlockByDays } from "@/lib/blockTime";

interface Props {
  data: AppData;
  days: WeekDay[];
  onOpenActivityImport: () => void;
  /** 打开「检索电脑活动」（F-046，仅本地后端可用） */
  onOpenActivityCollect: () => void;
  /** 待审天数（最近窗口里已有证据但未导入的天数），0 时不显示角标 */
  activityPendingDays?: number;
}

export default function StatsView({
  data,
  days,
  onOpenActivityImport,
  onOpenActivityCollect,
  activityPendingDays = 0,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [downloaded, setDownloaded] = useState(false);

  const stats = useMemo(() => computeWeekStats(data, days), [data, days]);
  const totalMinutes = stats.reduce((sum, stat) => sum + stat.minutes, 0);
  const doneMinutes = stats.reduce((sum, stat) => sum + stat.doneMinutes, 0);
  const scheduledCount = data.timeBlocks.filter(
    (block) =>
      block.status === "scheduled" &&
      days.some((d) => blockOverlapsDate(block, d.key))
  ).length;
  const pendingCount = data.timeBlocks.filter(
    (block) =>
      block.status === "pending" &&
      days.some((d) => blockOverlapsDate(block, d.key))
  ).length;
  const completionRate =
    totalMinutes > 0 ? Math.round((doneMinutes / totalMinutes) * 100) : 0;

  const report = useMemo(
    () => buildWeeklyReport(data, days),
    [data, days]
  );

  const weekActivities = useMemo(
    () => days.flatMap((day) => activitiesForDay(data, day.key)),
    [data, days]
  );

  // 活动记录（实际）按类目聚合：并入顶部统计的「时间投入」与「时间分布」
  const actualMinutesByCategory = useMemo(() => {
    const map = {} as Record<Category, number>;
    for (const activity of weekActivities) {
      if (activity.start === undefined || activity.end === undefined) continue;
      map[activity.category] =
        (map[activity.category] ?? 0) + (activity.end - activity.start);
    }
    return map;
  }, [weekActivities]);
  const actualTotalMinutes = Object.values(actualMinutesByCategory).reduce(
    (sum, minutes) => sum + minutes,
    0
  );
  const categoryRows = useMemo(
    () =>
      CATEGORY_ORDER.map((category) => ({
        category,
        plan: stats.find((stat) => stat.category === category),
        actual: actualMinutesByCategory[category] ?? 0,
      })).filter(({ plan, actual }) => plan || actual > 0),
    [stats, actualMinutesByCategory]
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
      label: "本周投入（计划）",
      value: minutesToDuration(totalMinutes),
      icon: Timer,
      hint: undefined as string | undefined,
    },
    {
      label: "完成时长",
      value: `${minutesToDuration(doneMinutes)} · ${completionRate}%`,
      icon: CheckCheck,
      hint: undefined as string | undefined,
    },
    {
      label: "实际投入",
      value: minutesToDuration(actualTotalMinutes),
      icon: ClipboardList,
      hint: `${weekActivities.length} 条记录` as string | undefined,
    },
    {
      label: "本周时间块",
      value: `${scheduledCount} 个`,
      icon: TrendingUp,
      hint: undefined as string | undefined,
    },
    {
      label: "待排期",
      value: `${pendingCount} 个`,
      icon: Hourglass,
      hint: undefined as string | undefined,
    },
  ];

  return (
    <div className="flex-1 space-y-4 overflow-y-auto thin-scroll">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
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
              {tile.hint && (
                <div className="mt-0.5 text-xs text-ink-muted-48">{tile.hint}</div>
              )}
            </div>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="tool-panel">
          <h3 className="type-caption-strong text-ink">类目时长统计</h3>
          <div className="mt-3 space-y-3">
            {categoryRows.length === 0 && (
              <p className="text-sm text-ink-muted-48">本周还没有时间块或活动记录</p>
            )}
            {categoryRows.map(({ category, plan, actual }) => {
              const meta = CATEGORIES[category];
              const planMinutes = plan?.minutes ?? 0;
              const ratio =
                totalMinutes > 0 ? Math.round((planMinutes / totalMinutes) * 100) : 0;
              const actualRatio = Math.min(
                100,
                Math.round((actual / Math.max(totalMinutes, 1)) * 100)
              );
              return (
                <div key={category}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="flex items-center gap-1.5 font-semibold text-ink-muted-80">
                      <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
                      {meta.label}
                    </span>
                    <span className="text-ink-muted-48">
                      {plan
                        ? `${minutesToDuration(planMinutes)} · ${ratio}%${
                            actual > 0 ? ` · 实际 ${minutesToDuration(actual)}` : ""
                          }`
                        : `实际 ${minutesToDuration(actual)}`}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-[#f0f0f0]">
                    <div
                      className={`h-full rounded-full ${meta.solid}`}
                      style={{ width: `${ratio}%` }}
                    />
                  </div>
                  {actual > 0 && (
                    <div className="mt-1 h-1 overflow-hidden rounded-full bg-[#f0f0f0]">
                      <div
                        className={`bar-actual h-full rounded-full ${meta.solid}`}
                        style={{ width: `${actualRatio}%` }}
                      />
                    </div>
                  )}
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
        <div className="flex items-center justify-between gap-2">
          <h3 className="type-caption-strong text-ink">本周 24 小时分布</h3>
          {weekActivities.length > 0 && (
            <span className="text-xs text-ink-muted-48">浅色 = 计划 · 深色 = 实际</span>
          )}
        </div>
        <div className="mt-4 space-y-2">
          {days.map((day) => {
            const daySegments = data.timeBlocks
              .filter(
                (block) =>
                  block.status === "scheduled" &&
                  blockOverlapsDate(block, day.key)
              )
              .flatMap((block) =>
                splitBlockByDays(block)
                  .filter((segment) => segment.dateKey === day.key)
                  .map((segment) => ({ block, segment }))
              )
              .sort((a, b) => a.segment.start - b.segment.start);
            return (
              <div key={day.key} className="flex items-center gap-2">
                <span className="w-14 shrink-0 text-xs text-ink-muted-48">
                  {day.label.split(" ")[0]}
                </span>
                <div className="relative h-6 flex-1 overflow-hidden rounded-[6px] bg-[#f5f5f7]">
                  {daySegments.map(({ block, segment }) => (
                    <div
                      key={`${block.id}:${segment.dateKey}:${segment.start}`}
                      className="absolute top-0 h-full rounded-sm"
                      style={{
                        left: `${(segment.start / 1440) * 100}%`,
                        width: `${Math.max(1, ((segment.end - segment.start) / 1440) * 100)}%`,
                        backgroundColor: CATEGORIES[block.category].soft,
                        borderLeft: `3px solid ${CATEGORIES[block.category].solid}`,
                      }}
                      title={`${block.name} ${segment.start / 60}:00`}
                    />
                  ))}
                  {activitiesForDay(data, day.key)
                    .filter(
                      (
                        activity
                      ): activity is Activity & { start: number; end: number } =>
                        activity.start !== undefined && activity.end !== undefined
                    )
                    .map((activity) => (
                      <div
                        key={activity.id}
                        className={`absolute top-0 h-full rounded-sm ${CATEGORIES[activity.category].solid} opacity-75`}
                        style={{
                          left: `${(activity.start / 1440) * 100}%`,
                          width: `${Math.max(0.8, ((activity.end - activity.start) / 1440) * 100)}%`,
                        }}
                        title={`实际 ${activity.summary}`}
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
              onClick={onOpenActivityCollect}
              className="btn-ghost relative"
              title="检索本机活动记录并导入（需本地运行后端）"
            >
              <Radar size={14} />
              检索电脑活动
              {activityPendingDays > 0 && (
                <span className="ml-1 rounded-full bg-[rgba(30,140,90,0.12)] px-1.5 text-[10px] font-medium text-[#146b46]">
                  {activityPendingDays}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={onOpenActivityImport}
              className="btn-ghost"
              title="把本机采集的工作活动确认后存为记录"
            >
              <ClipboardList size={14} />
              导入活动
            </button>
            <button
              type="button"
              onClick={handleCopy}
              className={`btn-ghost ${
                copied ? "!border-[rgba(30,140,90,0.28)] !bg-[rgba(30,140,90,0.08)] !text-[#146b46]" : ""
              }`}
            >
              {copied ? <CheckCheck size={14} /> : <ClipboardCopy size={14} />}
              {copied ? "已复制" : "复制"}
            </button>
            <button
              type="button"
              onClick={handleDownload}
              className={`btn-ghost ${
                downloaded ? "!border-[rgba(30,140,90,0.28)] !bg-[rgba(30,140,90,0.08)] !text-[#146b46]" : ""
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
