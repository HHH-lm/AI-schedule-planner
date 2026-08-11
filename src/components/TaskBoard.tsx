"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  BookMarked,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Eye,
  GripVertical,
  Loader2,
  MapPin,
  Pin,
  Plus,
  Sparkles,
} from "lucide-react";
import type { AppData, Task, TimeBlock } from "@/lib/types";
import type { WeekDay } from "@/lib/date";
import { addDays, minutesToHHMM, toDateKey, weekdayName } from "@/lib/date";
import { getBoardStart } from "@/lib/board";
import { CATEGORIES } from "@/lib/categories";
import { apiPost } from "@/lib/api";
import { normalizeQuadrant, QUADRANT_META } from "@/lib/priorities";
import ConfirmDialog from "@/components/ConfirmDialog";
import RestoreWeeksModal from "@/components/RestoreWeeksModal";

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
  hiddenWeeks: string[];
  onToggleHiddenWeek: (weekKey: string) => void;
  onMoveTask: (taskId: string, dateKey: string) => void;
  onEditTask: (task: Task) => void;
  onNewTask: () => void;
  onAddTasks: (names: Array<{ name: string; subtasks?: string[] } | string>) => void;
  onToggleSubtask: (taskId: string, subtaskId: string) => void;
  onAddSubtaskBlock: (taskId: string, subtaskName: string, dateKey: string) => void;
  onReorderTask: (fromTaskId: string, toTaskId: string, before: boolean) => void;
  onToggleTaskPinned: (taskId: string) => void;
  onEditBlock: (block: TimeBlock) => void;
  onToggleBlockDone: (blockId: string) => void;
  onOpenObsidian?: (block: TimeBlock) => void;
  onPlanTasks: (
    tasks: Task[]
  ) => Promise<{ added: number; blockedCount: number; message?: string | null }>;
}

export default function TaskBoard({
  data,
  days,
  obsidianVault,
  hiddenWeeks,
  onToggleHiddenWeek,
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
  onPlanTasks,
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
  const [breakdownBusy, setBreakdownBusy] = useState(false);
  const [planBusy, setPlanBusy] = useState(false);
  const [weekCount, setWeekCount] = useState(INITIAL_WEEKS);
  const [collapsedWeeks, setCollapsedWeeks] = useState<Set<string>>(
    () => new Set()
  );
  const [hideConfirmWeek, setHideConfirmWeek] = useState<BoardWeek | null>(
    null
  );
  const [restoreModalOpen, setRestoreModalOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const longPressRef = useRef<{
    timer: number | null;
    fired: boolean;
  }>({ timer: null, fired: false });

  useEffect(() => {
    if (hiddenWeeks.length === 0) setRestoreModalOpen(false);
  }, [hiddenWeeks]);

  const orderedTasks = useMemo(
    () =>
      [...data.tasks].sort(
        (a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned))
      ),
    [data.tasks]
  );

  const earliestDateKey = useMemo(() => {
    const keys: string[] = [];
    for (const task of data.tasks) {
      if (task.date) keys.push(task.date);
    }
    for (const block of data.timeBlocks) {
      keys.push(block.date);
    }
    return keys.sort()[0];
  }, [data.tasks, data.timeBlocks]);

  const boardStart = useMemo(
    () => getBoardStart(days[0].date, earliestDateKey),
    [days, earliestDateKey]
  );

  const todayKeyValue = toDateKey(new Date());
  const weeks = useMemo<BoardWeek[]>(() => {
    return Array.from({ length: weekCount }, (_, index) => {
      const start = addDays(boardStart, index * 7);
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
  }, [boardStart, weekCount, todayKeyValue]);

  const visibleWeeks = useMemo(
    () => weeks.filter((week) => !hiddenWeeks.includes(week.key)),
    [weeks, hiddenWeeks]
  );

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

  const clearLongPress = () => {
    if (longPressRef.current.timer) clearTimeout(longPressRef.current.timer);
    longPressRef.current.timer = null;
  };

  const handleWeekPointerDown = (week: BoardWeek) => {
    clearLongPress();
    longPressRef.current.fired = false;
    longPressRef.current.timer = window.setTimeout(() => {
      longPressRef.current.fired = true;
      setHideConfirmWeek(week);
    }, 600);
  };

  const handleWeekClick = (week: BoardWeek) => {
    if (longPressRef.current.fired) {
      longPressRef.current.fired = false;
      return;
    }
    toggleWeekCollapse(week.key);
  };

  const formatWeekLabel = (week: BoardWeek) => {
    const end = addDays(week.start, 6);
    return `${week.start.getMonth() + 1}/${week.start.getDate()} - ${end.getMonth() + 1}/${end.getDate()}`;
  };

  const handleMacro = async () => {
    const plan = macroText.trim();
    if (!plan || breakdownBusy) return;
    setBreakdownBusy(true);
    try {
      const result = await apiPost<{
        source: "openai" | "deepseek" | "local" | "none";
        tasks: Array<{ name: string; subtasks: string[] }>;
        message?: string;
      }>("/breakdown", {
        plan,
        provider: "auto",
        today: toDateKey(new Date()),
      });
      if (result.source === "none") {
        setFeedback(result.message ?? "AI 拆解失败，请稍后重试");
        return;
      }
      if (result.tasks.length === 0) {
        setFeedback("没有拆解出任务，请检查输入");
        return;
      }
      onAddTasks(
        result.tasks.map((task) => ({
          name: task.name,
          subtasks: task.subtasks,
        }))
      );
      setMacroText("");
      setFeedback(`已拆解出 ${result.tasks.length} 个任务`);
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : "AI 拆解失败，请稍后重试"
      );
    } finally {
      setBreakdownBusy(false);
      window.setTimeout(() => setFeedback(null), 4000);
    }
  };

  const handlePlan = async () => {
    if (planBusy || data.tasks.length === 0) {
      if (data.tasks.length === 0) setFeedback("请先添加任务，再使用 AI 规划");
      return;
    }
    setPlanBusy(true);
    try {
      const result = await onPlanTasks(data.tasks);
      const message =
        result.added > 0
          ? `AI 规划完成：新增 ${result.added} 个时间块${
              result.blockedCount > 0 ? `，跳过 ${result.blockedCount} 个冲突` : ""
            }`
          : "AI 没有生成新的时间块，请调整任务或已有安排后重试";
      setFeedback(message);
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : "AI 规划失败，请稍后重试"
      );
    } finally {
      setPlanBusy(false);
      window.setTimeout(() => setFeedback(null), 4000);
    }
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
      className="pending-chip !py-1 text-[10px]"
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
        className={`w-full cursor-pointer rounded-[8px] border-l-4 ${
          block.done ? "opacity-55" : ""
        } ${meta.bg} ${meta.border}`}
        title={title}
      >
        <div className="flex min-w-0 items-start justify-between gap-1 px-1.5 py-1">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-medium tabular-nums leading-tight text-ink-muted-48">
              {compact
                ? `${block.date.slice(5).replace("-", "/")} ${minutesToHHMM(block.start)}`
                : `${minutesToHHMM(block.start)}-${minutesToHHMM(block.end)}`}
            </div>
            <div
              className={`truncate font-semibold leading-tight text-ink ${
                compact ? "text-[11px]" : "text-xs"
              }`}
            >
              {block.name}
            </div>
            {!compact && block.location && (
              <div className="mt-0.5 flex items-center gap-0.5 text-[10px] leading-tight text-ink-muted-48">
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
                className="icon-btn-plain !h-6 !w-6"
              >
                <BookMarked size={13} className="text-ink-muted-48" />
              </button>
            )}
            <button
              type="button"
              title={block.done ? "标记未完成" : "标记完成"}
              onClick={(event) => {
                event.stopPropagation();
                onToggleBlockDone(block.id);
              }}
              className="icon-btn-plain !h-6 !w-6"
            >
              {block.done ? (
                <CheckCircle2 size={15} className="text-primary" />
              ) : (
                <Circle size={15} className="text-ink-muted-48" />
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
        className={`board-day-cell group ${
          day.isToday ? "today" : ""
        }`}
      >
        <div className="flex min-h-[68px] flex-col gap-1">
          {scheduledBlocks.length === 0 && pendingBlocks.length === 0 && (
            <div className="flex h-full items-center justify-center">
              <span className="text-[10px] text-ink-muted-48 opacity-0 transition group-hover:opacity-100">
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
        className="board-day-cell group"
      >
        <div className="flex min-h-[68px] flex-col gap-1">
          {scheduledBlocks.length === 0 && pendingBlocks.length === 0 && (
            <div className="flex h-full items-center justify-center">
              <span className="text-[10px] text-ink-muted-48 opacity-0 transition group-hover:opacity-100">
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
      <div className="tool-panel mb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <Sparkles size={18} className="shrink-0 text-primary" />
            <textarea
              rows={1}
              className="input-rect w-full resize-none"
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
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={handleMacro}
              disabled={breakdownBusy}
              className="btn-primary-pill"
            >
              {breakdownBusy ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Sparkles size={14} />
              )}
              {breakdownBusy ? "拆解中" : "拆解"}
            </button>
            <button
              type="button"
              onClick={handlePlan}
              disabled={planBusy || data.tasks.length === 0}
              className="btn-secondary-pill"
              title="为当前任务自动生成时间块"
            >
              {planBusy ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Sparkles size={14} />
              )}
              {planBusy ? "规划中" : "AI 规划"}
            </button>
            <button
              type="button"
              onClick={onNewTask}
              className="btn-secondary-pill"
            >
              <Plus size={14} />
              新建
            </button>
          </div>
        </div>
      </div>

      {feedback && (
        <div className="status-note-ok mb-3 inline-flex w-fit items-center gap-1.5 !py-1.5 text-xs">
          <CheckCircle2 size={13} />
          {feedback}
        </div>
      )}

      <div
        ref={scrollRef}
        onScroll={handleBoardScroll}
        className="board-shell board-scrollbar"
      >
        <div className="min-w-max">
          <div className="board-header">
            <div className="board-task-col">
              <span className="type-caption-strong text-ink">任务</span>
              <span className="text-[10px] text-ink-muted-48">
                左右排期 · 上下排序
              </span>
            </div>
            {visibleWeeks.map((week) => {
              const collapsed = collapsedWeeks.has(week.key);
              const weekBlocks = data.timeBlocks.filter(
                (b) =>
                  b.date >= week.key &&
                  b.date < toDateKey(addDays(week.start, 7))
              );
              return (
                <div
                  key={week.key}
                  className="board-week-header"
                  style={{
                    width: collapsed
                      ? "var(--board-day-w)"
                      : "calc(var(--board-day-w) * 7)",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => handleWeekClick(week)}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      setHideConfirmWeek(week);
                    }}
                    onPointerDown={() => handleWeekPointerDown(week)}
                    onPointerUp={clearLongPress}
                    onPointerLeave={clearLongPress}
                    onPointerCancel={clearLongPress}
                    className="flex w-full items-center gap-1 px-2 py-1.5 text-left hover:bg-canvas-parchment"
                    title={collapsed ? "展开本周" : "折叠本周；右键或长按隐藏本周显示"}
                  >
                    {collapsed ? (
                      <ChevronRight
                        size={13}
                        className="shrink-0 text-ink-muted-48"
                      />
                    ) : (
                      <ChevronDown
                        size={13}
                        className="shrink-0 text-ink-muted-48"
                      />
                    )}
                    <span className="truncate text-[10px] font-semibold text-ink-muted-80">
                      {formatWeekLabel(week)}
                    </span>
                    {weekBlocks.length > 0 && (
                      <span className="ml-auto rounded-full bg-[rgba(0,102,204,0.1)] px-1.5 py-px text-[10px] text-primary">
                        {weekBlocks.length}
                      </span>
                    )}
                  </button>
                  {!collapsed && (
                    <div className="flex">
                      {week.days.map((day) => (
                        <div
                          key={day.key}
                          className="board-day-head"
                        >
                          <span
                            className={`text-xs font-semibold ${
                              day.isToday ? "text-primary" : "text-ink-muted-80"
                            }`}
                          >
                            {weekdayName(day.date)}
                          </span>
                          <span className="text-[10px] text-ink-muted-48">
                            {day.date.getMonth() + 1}/{day.date.getDate()}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {hiddenWeeks.length > 0 && (
              <button
                type="button"
                onClick={() => setRestoreModalOpen(true)}
                className="flex shrink-0 items-center gap-1 border-r border-[#f0f0f0] px-2.5 text-[11px] font-medium text-ink-muted-48 hover:bg-canvas-parchment"
                title="恢复隐藏周显示"
              >
                <Eye size={13} />
                隐藏 {hiddenWeeks.length} 周
              </button>
            )}
            <button
              type="button"
              onClick={extendWeek}
              className="flex shrink-0 items-center gap-1 border-r border-[#f0f0f0] px-2.5 text-[11px] font-medium text-ink-muted-48 hover:bg-canvas-parchment"
              title="追加一周"
            >
              <Plus size={13} />
              一周
            </button>
          </div>

          {data.tasks.length === 0 && (
            <div className="flex items-center justify-center py-12 text-sm text-ink-muted-48">
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
                className={`board-task-row ${
                  dragTaskId === task.id ? "opacity-50" : ""
                }`}
              >
                <div
                  className="board-task-name-col"
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
                      className="cursor-grab text-ink-muted-48 hover:text-ink-muted-80"
                      title="左右拖拽排期，上下拖动排序"
                    >
                      <GripVertical size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => onEditTask(task)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <span className="flex items-center gap-1.5">
                        <span
                          className={`h-2 w-2 shrink-0 rounded-full ${QUADRANT_META[normalizeQuadrant(task.priority)].dot}`}
                          title={QUADRANT_META[normalizeQuadrant(task.priority)].label}
                        />
                        <span className="truncate text-sm font-medium text-ink">
                        {task.name}
                        </span>
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onToggleTaskPinned(task.id)}
                      title={task.pinned ? "取消置顶" : "置顶任务"}
                      className={`icon-btn-plain !h-6 !w-6 ${
                        task.pinned ? "text-primary" : "text-ink-muted-48"
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
                        className="shrink-0 text-primary"
                      />
                    ) : (
                      <Circle size={15} className="shrink-0 text-ink-muted-48" />
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
                            className={`flex cursor-grab items-center gap-1.5 rounded px-1 py-0.5 text-[11px] transition hover:bg-canvas-parchment ${
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
                                  className="text-primary"
                                />
                              ) : (
                                <Circle
                                  size={12}
                                  className="text-ink-muted-48 hover:text-ink"
                                />
                              )}
                            </button>
                            <span
                              className={`truncate ${
                                sub.done
                                  ? "text-ink-muted-48 line-through"
                                  : "text-ink-muted-80"
                              }`}
                            >
                              {sub.name}
                            </span>
                              {matchedBlock &&
                                matchedBlock.status === "scheduled" && (
                                <span className="ml-auto shrink-0 text-[10px] text-ink-muted-48">
                                  {matchedBlock.date.slice(5).replace("-", "/")}{" "}
                                  {minutesToHHMM(matchedBlock.start)}
                                </span>
                              )}
                            {!matchedBlock && (
                              <span className="ml-auto shrink-0 rounded-full bg-[rgba(201,110,18,0.1)] px-1.5 py-px text-[10px] text-[#9a5b12]">
                                未排期
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {task.subtasks.length === 0 && (
                    <div className="ml-5 text-[11px] text-ink-muted-48">
                      无子任务，点击编辑添加
                    </div>
                  )}
                </div>

                {visibleWeeks.map((week) => {
                  const collapsed = collapsedWeeks.has(week.key);
                  return collapsed
                    ? renderCollapsedWeekCell(taskBlocks, week)
                    : week.days.map((day) =>
                        renderDayCell(taskBlocks, day)
                      );
                })}
                {reorderTarget && reorderTarget.taskId === task.id && (
                  <div
                    className={`pointer-events-none absolute left-0 right-0 z-10 h-0.5 bg-primary ${
                      reorderTarget.position === "before" ? "top-0" : "bottom-0"
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {hideConfirmWeek && (
        <ConfirmDialog
          title="删除本周安排显示"
          description={`确定要隐藏 ${formatWeekLabel(hideConfirmWeek)} 的安排显示吗？只影响任务看板显示，不会删除任何数据。`}
          confirmLabel="确认隐藏"
          onConfirm={() => onToggleHiddenWeek(hideConfirmWeek.key)}
          onClose={() => setHideConfirmWeek(null)}
        />
      )}

      {restoreModalOpen && (
        <RestoreWeeksModal
          hiddenWeeks={hiddenWeeks}
          onRestore={onToggleHiddenWeek}
          onClose={() => setRestoreModalOpen(false)}
        />
      )}
    </div>
  );
}
