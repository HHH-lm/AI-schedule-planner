"use client";

import { useMemo, useRef, useState } from "react";
import {
  BookMarked,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  GripVertical,
  MapPin,
  Pin,
  Plus,
  Sparkles,
} from "lucide-react";
import type { AppData, Task, TimeBlock } from "@/lib/types";
import type { WeekDay } from "@/lib/date";
import { addDays, minutesToHHMM, toDateKey, weekdayName } from "@/lib/date";
import { CATEGORIES } from "@/lib/categories";

const DAY_W = 112;
const INITIAL_WEEKS = 4;
const EXTEND_THRESHOLD = 480;

interface BoardDay {
  key: string;
  date: Date;
  isToday: boolean;
}

interface BoardWeek {
  key: string;
  start: Date;
  days: BoardDay[];
}

interface Props {
  data: AppData;
  days: WeekDay[];
  obsidianVault?: string;
  onMoveTask: (taskId: string, dateKey: string) => void;
  onEditTask: (task: Task) => void;
  onNewTask: () => void;
  onAddTasks: (names: string[]) => void;
  onToggleSubtask: (taskId: string, subtaskId: string) => void;
  onAddSubtaskBlock: (taskId: string, subtaskName: string, dateKey: string) => void;
  onReorderTask: (fromTaskId: string, toTaskId: string, before: boolean) => void;
  onToggleTaskPinned: (taskId: string) => void;
  onEditBlock: (block: TimeBlock) => void;
  onToggleBlockDone: (blockId: string) => void;
  onOpenObsidian?: (block: TimeBlock) => void;
}

export default function TaskBoard({
  data,
  days,
  obsidianVault,
  onMoveTask,
  onEditTask,
  onNewTask,
  onAddTasks,
  onToggleSubtask,
  onAddSubtaskBlock,
  onReorderTask,
  onToggleTaskPinned,
  onEditBlock,
  onToggleBlockDone,
  onOpenObsidian,
}: Props) {
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);
  const [dragSubtaskId, setDragSubtaskId] = useState<string | null>(null);
  const [reorderTaskId, setReorderTaskId] = useState<string | null>(null);
  const [reorderTarget, setReorderTarget] = useState<{
    taskId: string;
    position: "before" | "after";
  } | null>(null);
  const [macroText, setMacroText] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [weekCount, setWeekCount] = useState(INITIAL_WEEKS);
  const [collapsedWeeks, setCollapsedWeeks] = useState<Set<string>>(
    () => new Set()
  );
  const scrollRef = useRef<HTMLDivElement>(null);

  const orderedTasks = useMemo(
    () =>
      [...data.tasks].sort(
        (a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned))
      ),
    [data.tasks]
  );

  const todayKeyValue = toDateKey(new Date());
  const weeks = useMemo<BoardWeek[]>(() => {
    return Array.from({ length: weekCount }, (_, index) => {
      const start = addDays(days[0].date, index * 7);
      return {
        key: toDateKey(start),
        start,
        days: Array.from({ length: 7 }, (_, dayIndex) => {
          const date = addDays(start, dayIndex);
          return {
            key: toDateKey(date),
            date,
            isToday: toDateKey(date) === todayKeyValue,
          };
        }),
      };
    });
  }, [days, weekCount, todayKeyValue]);

  const extendWeek = () => {
    setWeekCount((count) => count + 1);
  };

  const handleBoardScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollLeft + el.clientWidth >= el.scrollWidth - EXTEND_THRESHOLD) {
      setWeekCount((count) => count + 1);
    }
  };

  const toggleWeekCollapse = (weekKey: string) => {
    setCollapsedWeeks((prev) => {
      const next = new Set(prev);
      if (next.has(weekKey)) next.delete(weekKey);
      else next.add(weekKey);
      return next;
    });
  };

  const formatWeekLabel = (week: BoardWeek) => {
    const end = addDays(week.start, 6);
    return `${week.start.getMonth() + 1}/${week.start.getDate()} - ${end.getMonth() + 1}/${end.getDate()}`;
  };

  const handleMacro = () => {
    const names = macroText
      .split(/\n|、|，|,/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (names.length === 0) {
      setFeedback("请输入至少一个任务");
      return;
    }
    onAddTasks(names);
    setMacroText("");
    setFeedback(`已拆解出 ${names.length} 个任务`);
    window.setTimeout(() => setFeedback(null), 3000);
  };

  const handleDrop = (event: React.DragEvent, dayKey: string) => {
    event.preventDefault();
    event.stopPropagation();
    const raw = event.dataTransfer.getData("text/plain");
    if (!raw) return;
    if (raw.startsWith("subtask:")) {
      const name = raw.slice(8);
      const sep = name.indexOf(":");
      if (sep > 0) {
        const taskId = raw.slice(8, 8 + sep);
        const subtaskName = raw.slice(8 + sep + 1);
        if (taskId && subtaskName) onAddSubtaskBlock(taskId, subtaskName, dayKey);
      }
    } else {
      onMoveTask(raw, dayKey);
    }
    setDragTaskId(null);
    setDragSubtaskId(null);
    setReorderTaskId(null);
    setReorderTarget(null);
  };

  const clearReorder = () => {
    setReorderTaskId(null);
    setReorderTarget(null);
  };

  const handleTaskRowDragOver = (
    event: React.DragEvent,
    targetTask: Task
  ) => {
    if (!reorderTaskId || reorderTaskId === targetTask.id) return;
    const fromTask = data.tasks.find((task) => task.id === reorderTaskId);
    if (!fromTask) return;
    if (Boolean(fromTask.pinned) !== Boolean(targetTask.pinned)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const rect = event.currentTarget.getBoundingClientRect();
    const position =
      event.clientY < rect.top + rect.height / 2 ? "before" : "after";
    setReorderTarget({ taskId: targetTask.id, position });
  };

  const handleTaskRowDrop = (event: React.DragEvent, targetTask: Task) => {
    event.preventDefault();
    event.stopPropagation();
    const fromId =
      event.dataTransfer.getData("application/x-task-reorder") ||
      reorderTaskId;
    const fromTask = fromId
      ? data.tasks.find((task) => task.id === fromId)
      : null;
    if (!fromTask || fromTask.id === targetTask.id) {
      clearReorder();
      return;
    }
    if (Boolean(fromTask.pinned) !== Boolean(targetTask.pinned)) {
      clearReorder();
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const before = event.clientY < rect.top + rect.height / 2;
    onReorderTask(fromTask.id, targetTask.id, before);
    clearReorder();
    setDragTaskId(null);
  };

  const renderPendingChip = (block: TimeBlock) => (
    <button
      key={block.id}
      type="button"
      onClick={() => onEditBlock(block)}
      className="inline-flex max-w-full items-center gap-1 truncate rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-700 hover:bg-amber-100"
      title="待排期，点击分配时间"
    >
      <Sparkles size={10} />
      <span className="truncate">{block.name}</span>
    </button>
  );

  const renderBlockCard = (block: TimeBlock, compact: boolean) => {
    const meta = CATEGORIES[block.category];
    const hasObsidian = Boolean(
      block.obsidianVault || block.obsidianNote || obsidianVault
    );
    const title = compact
      ? `${block.name} ${block.date.slice(5).replace("-", "/")} ${minutesToHHMM(block.start)}`
      : `${block.name} ${minutesToHHMM(block.start)}-${minutesToHHMM(block.end)}`;
    return (
      <div
        key={block.id}
        role="button"
        tabIndex={0}
        onClick={() => onEditBlock(block)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onEditBlock(block);
          }
        }}
        className={`w-full cursor-pointer rounded-md border-l-4 ${
          block.done ? "opacity-55" : ""
        } ${meta.bg} ${meta.border}`}
        title={title}
      >
        <div className="flex min-w-0 items-start justify-between gap-1 px-1.5 py-1">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-medium tabular-nums leading-tight text-slate-500">
              {compact
                ? `${block.date.slice(5).replace("-", "/")} ${minutesToHHMM(block.start)}`
                : `${minutesToHHMM(block.start)}-${minutesToHHMM(block.end)}`}
            </div>
            <div
              className={`truncate font-semibold leading-tight ${
                compact ? "text-[11px]" : "text-xs"
              }`}
            >
              {block.name}
            </div>
            {!compact && block.location && (
              <div className="mt-0.5 flex items-center gap-0.5 text-[10px] leading-tight text-slate-500">
                <MapPin size={10} className="shrink-0" />
                <span className="truncate">{block.location}</span>
              </div>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            {hasObsidian && (
              <button
                type="button"
                title="打开 Obsidian"
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenObsidian?.(block);
                }}
                className="rounded p-0.5 hover:bg-white/70"
              >
                <BookMarked size={13} className="text-slate-500" />
              </button>
            )}
            <button
              type="button"
              title={block.done ? "标记未完成" : "标记完成"}
              onClick={(event) => {
                event.stopPropagation();
                onToggleBlockDone(block.id);
              }}
              className="shrink-0 rounded p-0.5 hover:bg-white/70"
            >
              {block.done ? (
                <CheckCircle2 size={15} className="text-emerald-600" />
              ) : (
                <Circle size={15} className="text-slate-400" />
              )}
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderDayCell = (taskBlocks: TimeBlock[], day: BoardDay) => {
    const dayBlocks = taskBlocks.filter((b) => b.date === day.key);
    const pendingBlocks = dayBlocks.filter((b) => b.status === "pending");
    const scheduledBlocks = dayBlocks.filter((b) => b.status === "scheduled");
    return (
      <div
        key={day.key}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
        }}
        onDrop={(event) => handleDrop(event, day.key)}
        className={`group relative shrink-0 border-r border-slate-100 p-1.5 ${
          day.isToday ? "bg-blue-50/30" : ""
        }`}
        style={{ width: DAY_W }}
      >
        <div className="flex min-h-[68px] flex-col gap-1">
          {scheduledBlocks.length === 0 && pendingBlocks.length === 0 && (
            <div className="flex h-full items-center justify-center">
              <span className="text-[10px] text-slate-300 opacity-0 transition group-hover:opacity-100">
                拖入排期
              </span>
            </div>
          )}
          {scheduledBlocks.map((block) => renderBlockCard(block, false))}
          {pendingBlocks.map(renderPendingChip)}
        </div>
      </div>
    );
  };

  const renderCollapsedWeekCell = (
    taskBlocks: TimeBlock[],
    week: BoardWeek
  ) => {
    const endKey = toDateKey(addDays(week.start, 7));
    const weekBlocks = taskBlocks.filter(
      (b) => b.date >= week.key && b.date < endKey
    );
    const pendingBlocks = weekBlocks.filter((b) => b.status === "pending");
    const scheduledBlocks = weekBlocks.filter((b) => b.status === "scheduled");
    return (
      <div
        key={week.key}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
        }}
        onDrop={(event) => handleDrop(event, week.key)}
        className="group relative shrink-0 border-r border-slate-100 p-1.5"
        style={{ width: DAY_W }}
      >
        <div className="flex min-h-[68px] flex-col gap-1">
          {scheduledBlocks.length === 0 && pendingBlocks.length === 0 && (
            <div className="flex h-full items-center justify-center">
              <span className="text-[10px] text-slate-300 opacity-0 transition group-hover:opacity-100">
                拖入本周
              </span>
            </div>
          )}
          {scheduledBlocks.map((block) => renderBlockCard(block, true))}
          {pendingBlocks.map(renderPendingChip)}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="mb-3 flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3 shadow-sm sm:flex-row">
        <div className="flex flex-1 items-center gap-2">
          <Sparkles size={18} className="shrink-0 text-blue-600" />
          <textarea
            rows={1}
            className="w-full resize-none rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            value={macroText}
            onChange={(event) => setMacroText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                handleMacro();
              }
            }}
            placeholder="输入项目计划，一行一个任务：做一期视频；写AI应用文章"
          />
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={handleMacro}
            className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Sparkles size={14} />
            拆解
          </button>
          <button
            type="button"
            onClick={onNewTask}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <Plus size={14} />
            新建
          </button>
        </div>
      </div>

      {feedback && (
        <div className="mb-3 inline-flex w-fit items-center gap-1.5 rounded-md bg-emerald-50 px-2.5 py-1 text-xs text-emerald-700">
          <CheckCircle2 size={13} />
          {feedback}
        </div>
      )}

      <div
        ref={scrollRef}
        onScroll={handleBoardScroll}
        className="flex-1 overflow-auto rounded-lg border border-slate-200 bg-white shadow-sm thin-scroll"
      >
        <div className="min-w-max">
          <div className="sticky top-0 z-20 flex border-b border-slate-200 bg-white">
            <div className="sticky left-0 z-30 flex w-72 shrink-0 flex-col justify-center gap-0.5 border-r border-slate-200 bg-white px-3 py-2">
              <span className="text-xs font-semibold text-slate-600">任务</span>
              <span className="text-[10px] text-slate-400">
                左右排期 · 上下排序
              </span>
            </div>
            {weeks.map((week) => {
              const collapsed = collapsedWeeks.has(week.key);
              const weekBlocks = data.timeBlocks.filter(
                (b) =>
                  b.date >= week.key &&
                  b.date < toDateKey(addDays(week.start, 7))
              );
              return (
                <div
                  key={week.key}
                  className="flex shrink-0 flex-col border-r border-slate-100"
                  style={{ width: collapsed ? DAY_W : DAY_W * 7 }}
                >
                  <button
                    type="button"
                    onClick={() => toggleWeekCollapse(week.key)}
                    className="flex w-full items-center gap-1 px-2 py-1.5 text-left hover:bg-slate-50"
                    title={collapsed ? "展开本周" : "折叠本周"}
                  >
                    {collapsed ? (
                      <ChevronRight
                        size={13}
                        className="shrink-0 text-slate-400"
                      />
                    ) : (
                      <ChevronDown
                        size={13}
                        className="shrink-0 text-slate-400"
                      />
                    )}
                    <span className="truncate text-[10px] font-semibold text-slate-600">
                      {formatWeekLabel(week)}
                    </span>
                    {weekBlocks.length > 0 && (
                      <span className="ml-auto rounded bg-blue-50 px-1 py-px text-[10px] text-blue-600">
                        {weekBlocks.length}
                      </span>
                    )}
                  </button>
                  {!collapsed && (
                    <div className="flex">
                      {week.days.map((day) => (
                        <div
                          key={day.key}
                          className="flex shrink-0 flex-col items-center justify-center border-r border-slate-100 px-2 py-2"
                          style={{ width: DAY_W }}
                        >
                          <span
                            className={`text-xs font-semibold ${
                              day.isToday ? "text-blue-700" : "text-slate-600"
                            }`}
                          >
                            {weekdayName(day.date)}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {day.date.getMonth() + 1}/{day.date.getDate()}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            <button
              type="button"
              onClick={extendWeek}
              className="flex shrink-0 items-center gap-1 border-r border-slate-100 px-2.5 text-[11px] font-medium text-slate-500 hover:bg-slate-50"
              title="追加一周"
            >
              <Plus size={13} />
              一周
            </button>
          </div>

          {data.tasks.length === 0 && (
            <div className="flex items-center justify-center py-12 text-sm text-slate-400">
              暂无任务，在上方输入项目计划
            </div>
          )}

          {orderedTasks.map((task) => {
            const taskBlocks = data.timeBlocks.filter(
              (b) => b.taskId === task.id
            );
            return (
              <div
                key={task.id}
                className={`relative flex border-b border-slate-100 transition hover:bg-slate-50/50 ${
                  dragTaskId === task.id ? "opacity-50" : ""
                }`}
              >
                <div
                  className="sticky left-0 z-10 flex w-72 shrink-0 flex-col gap-1.5 border-r border-slate-100 bg-white px-3 py-2.5"
                  onDragOver={(event) => handleTaskRowDragOver(event, task)}
                  onDrop={(event) => handleTaskRowDrop(event, task)}
                >
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.setData("text/plain", task.id);
                        event.dataTransfer.setData(
                          "application/x-task-reorder",
                          task.id
                        );
                        event.dataTransfer.effectAllowed = "move";
                        setDragTaskId(task.id);
                        setReorderTaskId(task.id);
                      }}
                      onDragEnd={() => {
                        setDragTaskId(null);
                        clearReorder();
                      }}
                      className="cursor-grab text-slate-300 hover:text-slate-500"
                      title="左右拖拽排期，上下拖动排序"
                    >
                      <GripVertical size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => onEditTask(task)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <span className="text-sm font-medium text-slate-800">
                        {task.name}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onToggleTaskPinned(task.id)}
                      title={task.pinned ? "取消置顶" : "置顶任务"}
                      className={`shrink-0 rounded p-0.5 transition ${
                        task.pinned
                          ? "text-amber-500"
                          : "text-slate-300 hover:text-slate-500"
                      }`}
                    >
                      <Pin
                        size={14}
                        fill={task.pinned ? "currentColor" : "none"}
                      />
                    </button>
                    {task.status === "done" ? (
                      <CheckCircle2
                        size={15}
                        className="shrink-0 text-emerald-600"
                      />
                    ) : (
                      <Circle size={15} className="shrink-0 text-slate-300" />
                    )}
                  </div>

                  {task.subtasks.length > 0 && (
                    <div className="ml-5 space-y-1">
                      {task.subtasks.map((sub) => {
                        const matchedBlock = taskBlocks.find(
                          (b) =>
                            b.name === sub.name ||
                            b.name.includes(sub.name) ||
                            sub.name.includes(b.name)
                        );
                        return (
                          <div
                            key={sub.id}
                            draggable
                            onDragStart={(event) => {
                              event.dataTransfer.setData(
                                "text/plain",
                                `subtask:${task.id}:${sub.name}`
                              );
                              setDragSubtaskId(sub.id);
                            }}
                            onDragEnd={() => setDragSubtaskId(null)}
                            className={`flex cursor-grab items-center gap-1.5 rounded px-1 py-0.5 text-[11px] transition hover:bg-slate-100 ${
                              dragSubtaskId === sub.id ? "opacity-50" : ""
                            }`}
                            title="拖拽子任务到右侧日期列排期"
                          >
                            <button
                              type="button"
                              draggable={false}
                              onClick={(event) => {
                                event.stopPropagation();
                                event.preventDefault();
                                onToggleSubtask(task.id, sub.id);
                              }}
                              className="shrink-0"
                            >
                              {sub.done ? (
                                <CheckCircle2
                                  size={12}
                                  className="text-emerald-500"
                                />
                              ) : (
                                <Circle
                                  size={12}
                                  className="text-slate-300 hover:text-slate-500"
                                />
                              )}
                            </button>
                            <span
                              className={`truncate ${
                                sub.done
                                  ? "text-slate-400 line-through"
                                  : "text-slate-600"
                              }`}
                            >
                              {sub.name}
                            </span>
                            {matchedBlock &&
                              matchedBlock.status === "scheduled" && (
                                <span className="ml-auto shrink-0 text-[10px] text-slate-400">
                                  {matchedBlock.date.slice(5).replace("-", "/")}{" "}
                                  {minutesToHHMM(matchedBlock.start)}
                                </span>
                              )}
                            {!matchedBlock && (
                              <span className="ml-auto shrink-0 rounded bg-amber-50 px-1 py-px text-[10px] text-amber-600">
                                未排期
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {task.subtasks.length === 0 && (
                    <div className="ml-5 text-[11px] text-slate-400">
                      无子任务，点击编辑添加
                    </div>
                  )}
                </div>

                {weeks.map((week) => {
                  const collapsed = collapsedWeeks.has(week.key);
                  return collapsed
                    ? renderCollapsedWeekCell(taskBlocks, week)
                    : week.days.map((day) =>
                        renderDayCell(taskBlocks, day)
                      );
                })}
                {reorderTarget && reorderTarget.taskId === task.id && (
                  <div
                    className={`pointer-events-none absolute left-0 right-0 z-10 h-0.5 bg-blue-500 ${
                      reorderTarget.position === "before" ? "top-0" : "bottom-0"
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
