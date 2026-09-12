"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  BookMarked,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  GripVertical,
  Loader2,
  MapPin,
  Pin,
  Plus,
  Sparkles,
} from "lucide-react";
import type { AppData, Task, TimeBlock } from "@/lib/types";
import type { WeekDay } from "@/lib/date";
import {
  addDays,
  minutesToHHMM,
  parseDateKey,
  startOfWeek,
  toDateKey,
  weekdayName,
} from "@/lib/date";
import {
  BOARD_MIN_WEEKS,
  getPastWeekKeys,
  getBoardStart,
  resolveBoardWeekCount,
  resolveInitialCollapsedWeeks,
} from "@/lib/board";
import {
  blockOverlapsDate,
  blockOverlapsRange,
  formatBlockRange,
} from "@/lib/blockTime";
import { CATEGORIES } from "@/lib/categories";
import { apiPost } from "@/lib/api";
import { aiRequestFields } from "@/lib/settings";
import {
  formatDeadlineShort,
  isDeadlineOverdue,
  extractDeadline,
} from "@/lib/deadline";
import { normalizeQuadrant, QUADRANT_META } from "@/lib/priorities";
import { orderTasks } from "@/lib/taskOrder";
import ConfirmDialog from "@/components/ConfirmDialog";
import RestoreWeeksModal from "@/components/RestoreWeeksModal";

const EXTEND_THRESHOLD = 480;
const LS_WEEK_COUNT = "board-week-count";
const LS_COLLAPSED_WEEKS = "board-collapsed-weeks";

function readSavedCollapsedWeeks(): string[] | null {
  try {
    const raw = localStorage.getItem(LS_COLLAPSED_WEEKS);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

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
  onAddTasks: (
    names: Array<
      {
        name: string;
        subtasks?: string[];
        subtaskDeadline?: string;
      } | string
    >
  ) => void;
  onToggleSubtask: (taskId: string, subtaskId: string) => void;
  onAddSubtaskBlock: (taskId: string, subtaskId: string, subtaskName: string, dateKey: string) => void;
  onReorderTask: (fromTaskId: string, toTaskId: string, before: boolean) => void;
  onToggleTaskPinned: (taskId: string) => void;
  onToggleTaskStatus: (taskId: string) => void;
  onEditBlock: (block: TimeBlock) => void;
  onToggleBlockDone: (blockId: string) => void;
  onOpenObsidian?: (block: TimeBlock) => void;
  /** 标题栏 AI 规划的结果提示（page 级状态，4 秒自动清除） */
  planFeedback?: string | null;
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
  onToggleTaskStatus,
  onEditBlock,
  onToggleBlockDone,
  onOpenObsidian,
  planFeedback,
}: Props) {
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);
  const [dragSubtaskId, setDragSubtaskId] = useState<string | null>(null);
  // 已完成任务的子任务默认折叠；记录用户手动展开过的任务 id
  const [expandedDoneTasks, setExpandedDoneTasks] = useState<Set<string>>(
    () => new Set(),
  );

  const toggleDoneSubtasks = (taskId: string) => {
    setExpandedDoneTasks((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };
  const [reorderTaskId, setReorderTaskId] = useState<string | null>(null);
  const [reorderTarget, setReorderTarget] = useState<{
    taskId: string;
    position: "before" | "after";
  } | null>(null);
  const [macroText, setMacroText] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [breakdownBusy, setBreakdownBusy] = useState(false);
  // 追加周数持久化到 localStorage：刷新后保留用户扩展的窗口长度
  const [weekCount, setWeekCount] = useState(() => {
    let saved: number | null = null;
    try {
      const raw = localStorage.getItem(LS_WEEK_COUNT);
      if (raw !== null) saved = Number(raw);
    } catch {
      saved = null;
    }
    return resolveBoardWeekCount(saved);
  });
  // 过去的周默认折叠；用户的展开/折叠状态持久化，刷新后原样恢复
  const [collapsedWeeks, setCollapsedWeeks] = useState<Set<string>>(() => {
    const currentMonday = startOfWeek(new Date());
    const keys: string[] = [];
    for (const task of data.tasks) if (task.date) keys.push(task.date);
    for (const block of data.timeBlocks) keys.push(block.date);
    const boardStart = getBoardStart(days[0].date, keys.sort()[0]);
    return new Set(
      resolveInitialCollapsedWeeks(
        boardStart,
        currentMonday,
        readSavedCollapsedWeeks()
      )
    );
  });
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

  // 追加周数与折叠状态变化即写入 localStorage（仅本机，不进云同步/撤销历史）
  useEffect(() => {
    try {
      localStorage.setItem(LS_WEEK_COUNT, String(weekCount));
    } catch {
      // 存储不可用时静默降级为会话内状态
    }
  }, [weekCount]);

  useEffect(() => {
    try {
      localStorage.setItem(
        LS_COLLAPSED_WEEKS,
        JSON.stringify(Array.from(collapsedWeeks))
      );
    } catch {
      // 存储不可用时静默降级
    }
  }, [collapsedWeeks]);

  const orderedTasks = useMemo(
    () => orderTasks(data.tasks),
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

  // 数据最早周的周一；无数据或数据不早于本周一时等于本周一
  const dataStart = useMemo(
    () => getBoardStart(days[0].date, earliestDateKey),
    [days, earliestDateKey]
  );

  // 渲染窗口起点固定为本周一：今天与后续日期始终落在"本周起 N 周"窗口内；
  // 更早的历史周以折叠条形式保留在窗口左侧（见下方 weeks useMemo）
  const boardStart = useMemo(() => startOfWeek(days[0].date), [days]);

  // 数据加载完成后一次性校正：挂载时 localStorage 可能晚于首帧写入，这里确保
  // 历史周默认折叠在首帧也生效（不影响已被持久化覆盖的用户状态语义）
  const dataStartKey = toDateKey(dataStart);
  const boardStartKey = toDateKey(boardStart);
  const collapseInitRef = useRef(readSavedCollapsedWeeks() !== null);
  useEffect(() => {
    if (collapseInitRef.current) return;
    if (dataStartKey >= boardStartKey) return;
    collapseInitRef.current = true;
    setCollapsedWeeks((prev) => {
      if (prev.size > 0) return prev;
      return new Set(getPastWeekKeys(dataStart, boardStart));
    });
  }, [dataStartKey, boardStartKey, dataStart, boardStart]);

  // 窗口需要覆盖历史周时，自动把周数扩展到"本周起 4 周"所需的最小长度；
  // 只增不减，用户手动追加的周数不受影响
  useEffect(() => {
    const required =
      getPastWeekKeys(dataStart, boardStart).length + BOARD_MIN_WEEKS;
    setWeekCount((count) => (count < required ? required : count));
  }, [dataStart, boardStart]);

  const todayKeyValue = toDateKey(new Date());
  const weeks = useMemo<BoardWeek[]>(() => {
    const buildWeek = (start: Date): BoardWeek => ({
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
    });
    // 历史周（本周一之前）以折叠条保留在窗口左侧，可展开、可拖入排期
    const past = getPastWeekKeys(dataStart, boardStart).map((key) =>
      buildWeek(parseDateKey(key))
    );
    const future = Array.from({ length: weekCount }, (_, index) =>
      buildWeek(addDays(boardStart, index * 7))
    );
    return [...past, ...future];
  }, [dataStart, boardStart, weekCount, todayKeyValue]);

  const visibleWeeks = useMemo(
    () => weeks.filter((week) => !hiddenWeeks.includes(week.key)),
    [weeks, hiddenWeeks]
  );

  const handleBoardScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollLeft + el.clientWidth >= el.scrollWidth - EXTEND_THRESHOLD) {
      setWeekCount((count) => count + 1);
    }
  };

  // 挂载时若有历史折叠周，初始视口定位到本周一（刷新永远回到从本周起的窗口，
  // 不记住用户滑到多远的未来——窗口本身已持久化，追加的周刷新后仍在）
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const pastCount = getPastWeekKeys(dataStart, boardStart).length;
    if (pastCount === 0) return;
    const dayWidth = parseFloat(
      getComputedStyle(el).getPropertyValue("--board-day-w")
    );
    if (Number.isFinite(dayWidth) && dayWidth > 0) {
      el.scrollLeft = pastCount * dayWidth;
    }
    // 依赖数组刻意为空：只在挂载时定位一次，后续滚动由用户控制
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        ...aiRequestFields(data.settings),
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
      const deadline = extractDeadline(plan);
      onAddTasks(
        result.tasks.map((task) => ({
          name: task.name,
          subtasks: task.subtasks,
          ...(deadline ? { subtaskDeadline: deadline } : {}),
        }))
      );
      setMacroText("");
      setFeedback(
        deadline
          ? `已拆解出 ${result.tasks.length} 个任务，截止日期 ${formatDeadlineShort(deadline)} 已填入子任务`
          : `已拆解出 ${result.tasks.length} 个任务`
      );
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : "AI 拆解失败，请稍后重试"
      );
    } finally {
      setBreakdownBusy(false);
      window.setTimeout(() => setFeedback(null), 4000);
    }
  };

  const handleDrop = (event: React.DragEvent, dayKey: string) => {
    event.preventDefault();
    event.stopPropagation();
    const raw = event.dataTransfer.getData("text/plain");
    if (!raw) return;
    if (raw.startsWith("subtask:")) {
      const parts = raw.slice(8).split(":");
      if (parts.length >= 3) {
        const taskId = parts[0];
        const subtaskId = parts[1];
        const subtaskName = parts.slice(2).join(":");
        if (taskId && subtaskId && subtaskName) onAddSubtaskBlock(taskId, subtaskId, subtaskName, dayKey);
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

  // 已完成任务折叠态的时间块：单行小 chip，点击仍可编辑
  const renderBlockChip = (block: TimeBlock) => {
    const meta = CATEGORIES[block.category];
    return (
      <button
        key={block.id}
        type="button"
        onClick={() => onEditBlock(block)}
        title={`${block.name} ${formatBlockRange(block)}，点击编辑`}
        className={`w-full cursor-pointer truncate rounded-[6px] border-l-2 px-1 py-0.5 text-left text-[10px] leading-tight text-ink-muted-80 ${
          block.done ? "opacity-55" : ""
        } ${meta.bg} ${meta.border}`}
      >
        {block.name}
      </button>
    );
  };

  const renderBlockCard = (block: TimeBlock, compact: boolean) => {
    const meta = CATEGORIES[block.category];
    const hasObsidian = Boolean(
      block.obsidianVault || block.obsidianNote || obsidianVault
    );
    const title = compact
      ? `${block.name} ${block.date.slice(5).replace("-", "/")} ${minutesToHHMM(block.start)}`
      : `${block.name} ${formatBlockRange(block)}`;
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

  const renderDayCell = (
    taskBlocks: TimeBlock[],
    day: BoardDay,
    mini = false
  ) => {
    const dayBlocks = taskBlocks.filter((b) => blockOverlapsDate(b, day.key));
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
        <div className={`flex flex-col gap-1 ${mini ? "min-h-[36px]" : "min-h-[68px]"}`}>
          {scheduledBlocks.length === 0 && pendingBlocks.length === 0 && (
            <div className="flex h-full items-center justify-center">
              <span className="text-[10px] text-ink-muted-48 opacity-0 transition group-hover:opacity-100">
                拖入排期
              </span>
            </div>
          )}
          {mini
            ? scheduledBlocks.map(renderBlockChip)
            : scheduledBlocks.map((block) => renderBlockCard(block, false))}
          {pendingBlocks.map(renderPendingChip)}
        </div>
      </div>
    );
  };

  const renderCollapsedWeekCell = (
    taskBlocks: TimeBlock[],
    week: BoardWeek,
    mini = false
  ) => {
    const endKey = toDateKey(addDays(week.start, 7));
    const weekBlocks = taskBlocks.filter(
      (b) => blockOverlapsRange(b, week.key, endKey)
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
        <div className={`flex flex-col gap-1 ${mini ? "min-h-[36px]" : "min-h-[68px]"}`}>
          {scheduledBlocks.length === 0 && pendingBlocks.length === 0 && (
            <div className="flex h-full items-center justify-center">
              <span className="text-[10px] text-ink-muted-48 opacity-0 transition group-hover:opacity-100">
                拖入本周
              </span>
            </div>
          )}
          {mini
            ? scheduledBlocks.map(renderBlockChip)
            : scheduledBlocks.map((block) => renderBlockCard(block, true))}
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
              className="btn-primary-pill btn-sm"
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
              onClick={onNewTask}
              className="btn-secondary-pill btn-sm"
            >
              <Plus size={14} />
              新建任务
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

      {planFeedback && (
        <div className="status-note-ok mb-3 inline-flex w-fit items-center gap-1.5 !py-1.5 text-xs">
          <Sparkles size={13} />
          {planFeedback}
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
            {/* 恢复隐藏周入口：与折叠周同款窄条，钉在任务列旁不随滚动消失 */}
            {hiddenWeeks.length > 0 && (
              <div
                className="board-week-header board-hidden-strip"
                style={{ width: "var(--board-day-w)" }}
              >
                <button
                  type="button"
                  onClick={() => setRestoreModalOpen(true)}
                  className="flex w-full items-center gap-1 px-2 py-1.5 text-left hover:bg-canvas-parchment"
                  title="恢复隐藏周显示"
                >
                  <ChevronRight
                    size={13}
                    className="shrink-0 text-ink-muted-48"
                  />
                  <span className="truncate text-[10px] font-semibold text-ink-muted-80">
                    {hiddenWeeks.length} 周已隐藏
                  </span>
                </button>
              </div>
            )}
            {visibleWeeks.map((week) => {
              const collapsed = collapsedWeeks.has(week.key);
              const weekBlocks = data.timeBlocks.filter(
                (b) =>
                  blockOverlapsRange(
                    b,
                    week.key,
                    toDateKey(addDays(week.start, 7))
                  )
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
            const taskDone = task.status === "done";
            const taskCollapsed = taskDone && !expandedDoneTasks.has(task.id);
            return (
              <div
                key={task.id}
                className={`board-task-row ${
                  dragTaskId === task.id ? "opacity-50" : ""
                } ${taskCollapsed ? "done-collapsed" : ""}`}
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
                        <span
                          className={`truncate text-sm font-semibold ${
                            task.status === "done"
                              ? "text-ink-muted-48 line-through"
                              : "text-ink"
                          }`}
                        >
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
                    <button
                      type="button"
                      onClick={() => onToggleTaskStatus(task.id)}
                      title={task.status === "done" ? "标记未完成" : "标记完成"}
                      aria-label={
                        task.status === "done" ? "标记未完成" : "标记完成"
                      }
                      className="shrink-0"
                    >
                      {task.status === "done" ? (
                        <CheckCircle2
                          size={15}
                          className="text-primary"
                        />
                      ) : (
                        <Circle
                          size={15}
                          className="text-ink-muted-48 hover:text-ink"
                        />
                      )}
                    </button>
                  </div>

                  {taskDone && (task.subtasks.length > 0 || taskBlocks.length > 0) && (
                    <button
                      type="button"
                      onClick={() => toggleDoneSubtasks(task.id)}
                      className="ml-5 flex w-fit items-center gap-1.5 rounded px-1 py-0.5 text-[11px] text-ink-muted-80 transition hover:bg-canvas-parchment"
                      title={
                        expandedDoneTasks.has(task.id)
                          ? "收起子任务与时间块"
                          : "展开子任务与时间块"
                      }
                    >
                      {expandedDoneTasks.has(task.id) ? (
                        <ChevronDown
                          size={12}
                          className="shrink-0 text-ink-muted-48"
                        />
                      ) : (
                        <ChevronRight
                          size={12}
                          className="shrink-0 text-ink-muted-48"
                        />
                      )}
                      {[
                        task.subtasks.length > 0
                          ? `${task.subtasks.length} 个子任务`
                          : null,
                        taskBlocks.length > 0
                          ? `${taskBlocks.length} 个时间块`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </button>
                  )}

                  {task.subtasks.length > 0 &&
                    (!taskDone || expandedDoneTasks.has(task.id)) && (
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
                                `subtask:${task.id}:${sub.id}:${sub.name}`
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
                            {sub.deadline && (
                              <span
                                title={`截止日期 ${sub.deadline}`}
                                className={`ml-auto shrink-0 rounded-full px-1.5 py-px text-[10px] font-semibold leading-none ${
                                  taskDone || sub.done || isDeadlineOverdue(sub.deadline)
                                    ? "bg-[rgba(142,142,147,0.12)] text-[#6e6e73]"
                                    : "bg-[rgba(0,102,204,0.08)] text-primary"
                                }`}
                              >
                                截止 {formatDeadlineShort(sub.deadline)}
                              </span>
                            )}
                            {matchedBlock &&
                                matchedBlock.status === "scheduled" && (
                                <span className={`${sub.deadline ? "" : "ml-auto "}shrink-0 text-[10px] text-ink-muted-48`}>
                                  {matchedBlock.date.slice(5).replace("-", "/")}{" "}
                                  {minutesToHHMM(matchedBlock.start)}
                                </span>
                              )}
                            {!matchedBlock && (
                              <span
                                className={`${sub.deadline ? "" : "ml-auto "}shrink-0 rounded-full px-1.5 py-px text-[10px] ${
                                  taskDone || sub.done
                                    ? "bg-[rgba(142,142,147,0.12)] text-[#6e6e73]"
                                    : "bg-[rgba(201,110,18,0.1)] text-[#9a5b12]"
                                }`}
                              >
                                未排期
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {!taskDone && task.subtasks.length === 0 && (
                    <div className="ml-5 text-[11px] text-ink-muted-48">
                      无子任务，点击编辑添加
                    </div>
                  )}
                </div>

                {visibleWeeks.map((week) => {
                  const collapsed = collapsedWeeks.has(week.key);
                  return collapsed
                    ? renderCollapsedWeekCell(taskBlocks, week, taskCollapsed)
                    : week.days.map((day) =>
                        renderDayCell(taskBlocks, day, taskCollapsed)
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
