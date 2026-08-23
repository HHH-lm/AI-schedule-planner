"use client";

import { useMemo } from "react";
import {
  BookMarked,
  CalendarCheck,
  CheckCircle2,
  Circle,
  ListTodo,
  MapPin,
  Sparkles,
  Timer,
  TrendingUp,
} from "lucide-react";
import type {
  AppData,
  Subtask,
  Task,
  TaskQuadrant,
  TimeBlock,
} from "@/lib/types";
import { CATEGORIES } from "@/lib/categories";
import { addDays, toDateKey } from "@/lib/date";
import {
  blockOverlapsDate,
  formatBlockRange,
  splitBlockByDays,
} from "@/lib/blockTime";
import {
  normalizeQuadrant,
  QUADRANT_META,
  QUADRANT_ORDER,
} from "@/lib/priorities";
import { collectTodoSubtasks } from "@/lib/todaySubtasks";

interface Props {
  data: AppData;
  onToggleDone: (blockId: string) => void;
  onEditBlock: (block: TimeBlock) => void;
  onEditTask: (task: Task) => void;
  onMoveTaskToToday: (taskId: string) => void;
  onToggleSubtask: (taskId: string, subtaskId: string) => void;
  onAddSubtaskBlock: (
    taskId: string,
    subtaskId: string,
    subtaskName: string,
    dateKey: string
  ) => void;
  onOpenObsidian?: (block: TimeBlock) => void;
}

const WEEKDAY_FULL = [
  "星期日",
  "星期一",
  "星期二",
  "星期三",
  "星期四",
  "星期五",
  "星期六",
];

function dayStartFor(block: TimeBlock, dateKey: string): number {
  const segment = splitBlockByDays(block).find((s) => s.dateKey === dateKey);
  return segment ? segment.start : block.start;
}

export default function TodayView({
  data,
  onToggleDone,
  onEditBlock,
  onEditTask,
  onMoveTaskToToday,
  onToggleSubtask,
  onAddSubtaskBlock,
  onOpenObsidian,
}: Props) {
  const today = new Date();
  const todayKeyValue = toDateKey(today);
  const tomorrowKeyValue = toDateKey(addDays(today, 1));
  const todayLabel = `${today.getMonth() + 1}月${today.getDate()}日`;

  const todayBlocks = useMemo(
    () =>
      data.timeBlocks
        .filter(
          (block) =>
            block.status === "scheduled" &&
            blockOverlapsDate(block, todayKeyValue)
        )
        .sort((a, b) => dayStartFor(a, todayKeyValue) - dayStartFor(b, todayKeyValue)),
    [data.timeBlocks, todayKeyValue]
  );

  const pendingToday = useMemo(
    () =>
      data.timeBlocks
        .filter(
          (block) =>
            block.status === "pending" &&
            blockOverlapsDate(block, todayKeyValue)
        )
        .sort((a, b) => dayStartFor(a, todayKeyValue) - dayStartFor(b, todayKeyValue)),
    [data.timeBlocks, todayKeyValue]
  );

  const todoSubtasks = useMemo(
    () => collectTodoSubtasks(data.tasks),
    [data.tasks]
  );

  const todoByQuadrant = useMemo(() => {
    const groups: Record<TaskQuadrant, Array<{ task: Task; subtask: Subtask }>> = {
      "urgent-important": [],
      important: [],
      urgent: [],
      neither: [],
    };
    for (const item of todoSubtasks) {
      groups[normalizeQuadrant(item.task.priority)].push(item);
    }
    return groups;
  }, [todoSubtasks]);

  const tomorrowBlocks = useMemo(
    () =>
      data.timeBlocks
        .filter(
          (block) =>
            block.status === "scheduled" &&
            blockOverlapsDate(block, tomorrowKeyValue)
        )
        .sort(
          (a, b) =>
            dayStartFor(a, tomorrowKeyValue) - dayStartFor(b, tomorrowKeyValue)
        ),
    [data.timeBlocks, tomorrowKeyValue]
  );

  const doneCount = todayBlocks.filter((block) => block.done).length;
  const progress =
    todayBlocks.length > 0 ? Math.round((doneCount / todayBlocks.length) * 100) : 0;

  const renderBlockActions = (block: TimeBlock) => {
    const hasObsidian = Boolean(block.obsidianVault || block.obsidianNote);
    return (
      <>
        {hasObsidian && (
          <span
            role="button"
            tabIndex={0}
            className="icon-btn-plain !h-9 !w-9"
            title="打开 Obsidian"
            onClick={(event) => {
              event.stopPropagation();
              onOpenObsidian?.(block);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                event.stopPropagation();
                onOpenObsidian?.(block);
              }
            }}
          >
            <BookMarked size={16} className="text-ink-muted-48" />
          </span>
        )}
        <span
          role="button"
          tabIndex={0}
          className="icon-btn-plain !h-9 !w-9"
          title={block.done ? "标记未完成" : "标记完成"}
          onClick={(event) => {
            event.stopPropagation();
            onToggleDone(block.id);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              event.stopPropagation();
              onToggleDone(block.id);
            }
          }}
        >
          {block.done ? (
            <CheckCircle2 size={18} className="text-primary" />
          ) : (
            <Circle size={18} className="text-ink-muted-48" />
          )}
        </span>
      </>
    );
  };

  const renderMobileBlockRow = (block: TimeBlock, showDate: boolean) => {
    const meta = CATEGORIES[block.category];
    return (
      <button
        key={block.id}
        type="button"
        onClick={() => onEditBlock(block)}
        className={`flex w-full items-center gap-3 rounded-[8px] border-l-4 px-3 py-2.5 text-left transition ${
          block.done ? "opacity-55" : ""
        } ${meta.bg} ${meta.border}`}
      >
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex min-w-0 items-center gap-1.5">
            {showDate && (
              <span className="shrink-0 text-[11px] font-semibold tabular-nums text-ink-muted-48">
                {block.date.slice(5).replace("-", "/")}
              </span>
            )}
            <span className="shrink-0 text-xs font-semibold tabular-nums text-ink">
              {formatBlockRange(block)}
            </span>
            <span className="truncate text-sm font-medium text-ink">{block.name}</span>
          </span>
          {block.location && (
            <span className="flex items-center gap-1 text-[11px] text-ink-muted-48">
              <MapPin size={11} />
              <span className="truncate">{block.location}</span>
            </span>
          )}
        </span>
        <span className="flex shrink-0 items-center gap-1">{renderBlockActions(block)}</span>
      </button>
    );
  };

  const renderDesktopBlockRow = (block: TimeBlock) => {
    const meta = CATEGORIES[block.category];
    return (
      <div
        key={block.id}
        className={`grid grid-cols-[88px_minmax(0,1fr)_110px_96px_auto] items-center gap-3 border-b border-divider-soft py-2.5 last:border-0 ${
          block.done ? "opacity-55" : ""
        }`}
      >
        <span className="text-sm font-semibold tabular-nums text-ink">
          {formatBlockRange(block)}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-ink">{block.name}</span>
          {block.location && (
            <span className="mt-0.5 flex items-center gap-1 text-xs text-ink-muted-48">
              <MapPin size={11} />
              <span className="truncate">{block.location}</span>
            </span>
          )}
        </span>
        <span className="flex items-center gap-1.5 text-xs text-ink-muted-80">
          <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
          {meta.label}
        </span>
        <span className={`text-xs ${block.done ? "text-primary" : "text-ink-muted-48"}`}>
          {block.done ? "已完成" : "待办"}
        </span>
        <span className="flex items-center gap-1">{renderBlockActions(block)}</span>
      </div>
    );
  };

  const renderMobileTaskRow = (item: { task: Task; subtask: Subtask }) => {
    const { task, subtask } = item;
    return (
      <div
        key={subtask.id}
        className="rounded-[8px] border border-hairline bg-canvas-parchment px-3 py-2.5"
      >
        <div className="flex items-center gap-2">
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${QUADRANT_META[normalizeQuadrant(task.priority)].dot}`}
            title={QUADRANT_META[normalizeQuadrant(task.priority)].label}
          />
          <button
            type="button"
            onClick={() => onToggleSubtask(task.id, subtask.id)}
            className="flex min-w-0 flex-1 items-center gap-2 text-left"
          >
            <span
              className={`h-4 w-4 shrink-0 rounded-full border ${
                subtask.done ? "border-primary bg-primary" : "border-ink-muted-48"
              }`}
            />
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-ink">
                {subtask.name}
              </span>
              <span className="block truncate text-[11px] text-ink-muted-48">
                {task.name}
              </span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => onAddSubtaskBlock(task.id, subtask.id, subtask.name, todayKeyValue)}
            className="btn-ghost !px-3 !py-1.5 !text-xs"
          >
            排到今天
          </button>
        </div>
      </div>
    );
  };

  const renderDesktopTaskRow = (item: { task: Task; subtask: Subtask }) => {
    const { task, subtask } = item;
    return (
      <div
        key={subtask.id}
        className="flex items-center justify-between gap-3 rounded-[8px] border border-hairline bg-canvas-parchment px-3 py-2.5"
      >
        <button
          type="button"
          onClick={() => onToggleSubtask(task.id, subtask.id)}
          className="flex min-w-0 items-center gap-2 text-left"
        >
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${QUADRANT_META[normalizeQuadrant(task.priority)].dot}`}
            title={QUADRANT_META[normalizeQuadrant(task.priority)].label}
          />
          <span
            className={`h-4 w-4 shrink-0 rounded-full border ${
              subtask.done ? "border-primary bg-primary" : "border-ink-muted-48"
            }`}
          />
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-ink">
              {subtask.name}
            </span>
            <span className="mt-0.5 block text-xs text-ink-muted-48">
              {task.name}
            </span>
          </span>
        </button>
        <span className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => onAddSubtaskBlock(task.id, subtask.id, subtask.name, todayKeyValue)}
            className="btn-ghost !px-3 !py-1.5 !text-xs"
          >
            排到今天
          </button>
        </span>
      </div>
    );
  };

  const renderQuadrantSection = (quadrant: TaskQuadrant, desktop: boolean) => {
    const meta = QUADRANT_META[quadrant];
    const items = todoByQuadrant[quadrant];
    return (
      <div
        key={quadrant}
        className={`rounded-[8px] border border-hairline ${meta.bg} p-3`}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-ink">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${meta.dot}`} />
            <span className="truncate">{meta.label}</span>
          </span>
          <span className="shrink-0 text-[11px] text-ink-muted-48">
            {items.length} 项
          </span>
        </div>
        <div className="mt-2 space-y-2">
          {items.length === 0 && (
            <p className="text-xs text-ink-muted-48">
              {meta.description}，暂无待办
            </p>
          )}
          {items.map((item) =>
            desktop ? renderDesktopTaskRow(item) : renderMobileTaskRow(item)
          )}
        </div>
      </div>
    );
  };

  const summaryTiles = [
    {
      label: "今日安排",
      value: `${todayBlocks.length} 项`,
      icon: CalendarCheck,
    },
    {
      label: "完成进度",
      value: `${progress}%`,
      icon: CheckCircle2,
    },
    {
      label: "待办任务",
      value: `${todoSubtasks.length} 项`,
      icon: ListTodo,
    },
    {
      label: "明日安排",
      value: `${tomorrowBlocks.length} 项`,
      icon: TrendingUp,
    },
  ];

  return (
    <>
      {/* 移动端：单列卡片流 */}
      <div className="flex-1 space-y-4 overflow-y-auto thin-scroll md:hidden">
        <div className="tool-panel">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-ink-muted-48">
                <CalendarCheck size={16} className="text-primary" />
                <span className="type-caption-strong text-ink">{todayLabel}</span>
                <span className="text-xs">{WEEKDAY_FULL[today.getDay()]}</span>
              </div>
              <div className="mt-1 text-2xl font-semibold tracking-tight text-ink">
                今日待办
              </div>
            </div>
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[rgba(0,102,204,0.08)] text-primary">
              <ListTodo size={22} />
            </div>
          </div>
          {todayBlocks.length > 0 && (
            <div className="mt-4">
              <div className="mb-1 flex items-center justify-between text-xs text-ink-muted-48">
                <span>
                  已完成 {doneCount}/{todayBlocks.length}
                </span>
                <span>{progress}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-[#f0f0f0]">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}
        </div>

        <section className="tool-panel">
          <h3 className="type-caption-strong flex items-center gap-1.5 text-ink">
            <CalendarCheck size={15} className="text-primary" />
            今日安排
          </h3>
          <div className="mt-3 space-y-2">
            {todayBlocks.length === 0 && pendingToday.length === 0 && (
              <p className="text-sm text-ink-muted-48">
                今天还没有安排。去“周计划”新建时间块，或用自然语言快速生成。
              </p>
            )}
            {todayBlocks.map((block) => renderMobileBlockRow(block, false))}
            {pendingToday.map((block) => (
              <button
                key={block.id}
                type="button"
                onClick={() => onEditBlock(block)}
                className="pending-chip w-full justify-start !py-2 !text-sm"
              >
                <Sparkles size={13} />
                <span className="truncate">{block.name}</span>
                <span className="ml-auto shrink-0 text-[11px]">待定时间</span>
              </button>
            ))}
          </div>
        </section>

        <section className="tool-panel">
          <h3 className="type-caption-strong flex items-center gap-1.5 text-ink">
            <ListTodo size={15} className="text-primary" />
            待办 · 四象限
            {todoSubtasks.length > 0 && (
              <span className="rounded-full bg-[rgba(0,102,204,0.08)] px-2 py-0.5 text-[11px] text-primary">
                {todoSubtasks.length}
              </span>
            )}
          </h3>
          <div className="mt-3 space-y-2">
            {todoSubtasks.length === 0 && (
              <p className="text-sm text-ink-muted-48">没有未完成的子任务，一切就绪。</p>
            )}
            {QUADRANT_ORDER.map((quadrant) =>
              renderQuadrantSection(quadrant, false)
            )}
          </div>
        </section>

        <section className="tool-panel">
          <h3 className="type-caption-strong flex items-center gap-1.5 text-ink">
            <CalendarCheck size={15} className="text-ink-muted-48" />
            明日预览
          </h3>
          <div className="mt-3 space-y-2">
            {tomorrowBlocks.length === 0 && (
              <p className="text-sm text-ink-muted-48">明天还没有安排。</p>
            )}
            {tomorrowBlocks.map((block) => renderMobileBlockRow(block, true))}
          </div>
        </section>
      </div>

      {/* 桌面端：双栏仪表盘 */}
      <div className="hidden flex-1 space-y-4 overflow-y-auto thin-scroll md:block">
        <div className="tool-panel">
          <div className="flex flex-wrap items-center justify-between gap-5">
            <div className="min-w-0">
              <div className="type-caption-strong text-primary">
                {todayLabel} · {WEEKDAY_FULL[today.getDay()]}
              </div>
              <h2 className="type-display-md mt-1">今日待办</h2>
            </div>
            <div className="grid w-full grid-cols-2 gap-3 lg:w-auto lg:grid-cols-4">
              {summaryTiles.map((tile) => {
                const Icon = tile.icon;
                return (
                  <div
                    key={tile.label}
                    className="flex min-w-[140px] items-center gap-3 rounded-[8px] bg-canvas-parchment px-3.5 py-2.5"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[rgba(0,102,204,0.08)] text-primary">
                      <Icon size={15} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-xs text-ink-muted-48">{tile.label}</span>
                      <span className="block truncate text-base font-semibold text-ink">
                        {tile.value}
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
          {todayBlocks.length > 0 && (
            <div className="mt-5">
              <div className="mb-1 flex items-center justify-between text-xs text-ink-muted-48">
                <span>
                  已完成 {doneCount}/{todayBlocks.length}
                </span>
                <span>{progress}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-[#f0f0f0]">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2 flex flex-col gap-4">
            <section className="tool-panel">
              <h3 className="type-caption-strong flex items-center gap-1.5 text-ink">
                <CalendarCheck size={15} className="text-primary" />
                今日安排
                {todayBlocks.length > 0 && (
                  <span className="rounded-full bg-[rgba(0,102,204,0.08)] px-2 py-0.5 text-[11px] text-primary">
                    {todayBlocks.length}
                  </span>
                )}
              </h3>
              <div className="mt-2">
                {todayBlocks.length === 0 && pendingToday.length === 0 && (
                  <p className="py-4 text-sm text-ink-muted-48">
                    今天还没有安排。去“周计划”新建时间块，或用自然语言快速生成。
                  </p>
                )}
                {todayBlocks.map(renderDesktopBlockRow)}
                {pendingToday.map((block) => (
                  <button
                    key={block.id}
                    type="button"
                    onClick={() => onEditBlock(block)}
                    className="pending-chip mt-2 w-full justify-start !py-2"
                  >
                    <Sparkles size={13} />
                    <span className="truncate">{block.name}</span>
                    <span className="ml-auto shrink-0 text-[11px]">待定时间</span>
                  </button>
                ))}
              </div>
            </section>

            <section className="tool-panel">
              <h3 className="type-caption-strong flex items-center gap-1.5 text-ink">
                <ListTodo size={15} className="text-primary" />
                待办 · 四象限
                {todoSubtasks.length > 0 && (
                  <span className="rounded-full bg-[rgba(0,102,204,0.08)] px-2 py-0.5 text-[11px] text-primary">
                    {todoSubtasks.length}
                  </span>
                )}
              </h3>
              <div className="mt-3">
                {todoSubtasks.length === 0 && (
                  <p className="text-sm text-ink-muted-48">没有未完成的子任务，一切就绪。</p>
                )}
                <div className="grid grid-cols-2 gap-3">
                  {QUADRANT_ORDER.map((quadrant) =>
                    renderQuadrantSection(quadrant, true)
                  )}
                </div>
              </div>
            </section>
          </div>

          <section className="tool-panel self-start">
            <h3 className="type-caption-strong flex items-center gap-1.5 text-ink">
              <Timer size={15} className="text-ink-muted-48" />
              明日预览
            </h3>
            <div className="mt-3 space-y-2">
              {tomorrowBlocks.length === 0 && (
                <p className="text-sm text-ink-muted-48">明天还没有安排。</p>
              )}
              {tomorrowBlocks.map(renderDesktopBlockRow)}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
