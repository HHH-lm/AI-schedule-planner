"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  BarChart3,
  CalendarPlus,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Cloud,
  CloudOff,
  Redo2,
  Settings,
  Undo2,
} from "lucide-react";
import type {
  AppData,
  ParsedSchedule,
  Task,
  TimeBlock,
  ViewMode,
} from "@/lib/types";
import {
  formatWeekRange,
  getWeekDays,
  todayKey,
  weekOffsetForDate,
} from "@/lib/date";
import {
  loadLocalData,
  saveLocalData,
  uid,
} from "@/lib/storage";
import {
  isSupabaseConfigured,
  loadRemoteData,
  saveRemoteData,
} from "@/lib/supabase";
import { logInfo } from "@/lib/logger";
import { makeSampleData } from "@/lib/sample";
// import { buildWeekICS } from "@/lib/ics"; // 苹果日历导出暂未启用
import WeekTimeline from "@/components/WeekTimeline";
import QuickAdd from "@/components/QuickAdd";
import BlockModal from "@/components/BlockModal";
import TaskBoard from "@/components/TaskBoard";
import TaskModal from "@/components/TaskModal";
import StatsView from "@/components/StatsView";
import SettingsModal from "@/components/SettingsModal";
import { buildObsidianUrl } from "@/lib/obsidian";
import {
  commitHistoryState,
  createHistoryState,
  redoHistoryState,
  undoHistoryState,
  type HistoryState,
} from "@/lib/history";

const TABS: Array<{
  key: ViewMode;
  label: string;
  icon: typeof CalendarRange;
}> = [
  { key: "week", label: "周时间轴", icon: CalendarRange },
  { key: "board", label: "任务看板", icon: ClipboardList },
  { key: "stats", label: "统计周报", icon: BarChart3 },
];

export default function Home() {
  const [historyState, setHistoryState] = useState<HistoryState<AppData> | null>(
    null
  );
  const data = historyState?.present ?? null;
  const [hydrated, setHydrated] = useState(false);
  const [view, setView] = useState<ViewMode>("week");
  const [weekOffset, setWeekOffset] = useState(0);
  const [syncState, setSyncState] = useState<"loading" | "local" | "supabase">(
    "loading"
  );
  const [editingBlock, setEditingBlock] = useState<TimeBlock | null>(null);
  const [blockModalOpen, setBlockModalOpen] = useState(false);
  const [newBlockTime, setNewBlockTime] = useState<{
    date: string;
    start: number;
  } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [focusTarget, setFocusTarget] = useState<{
    date: string;
    start: number;
    end: number;
  } | null>(null);
  const focusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
    },
    []
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let loaded = loadLocalData();
      if (isSupabaseConfigured()) {
        const remote = await loadRemoteData();
        if (!cancelled && remote) loaded = remote;
        if (!cancelled) {
          setSyncState("supabase");
          logInfo("app_hydrated", { storage: "supabase" });
        }
      } else if (!cancelled) {
        setSyncState("local");
        logInfo("app_hydrated", { storage: "local" });
      }
      if (!cancelled) {
        const initial = loaded ?? makeSampleData();
        setHistoryState(createHistoryState(initial));
        setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!data || !hydrated) return;
    saveLocalData(data);
    if (isSupabaseConfigured()) saveRemoteData(data);
  }, [data, hydrated]);

  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // 离线缓存不可用时继续在线使用
      });
    }
  }, []);

  const commitData = useCallback(
    (updater: (prev: AppData) => AppData) => {
      setHistoryState((state) => {
        if (!state) return state;
        const next = updater(state.present);
        if (next === state.present) return state;
        return commitHistoryState(state, next);
      });
    },
    []
  );

  const undo = useCallback(() => {
    setHistoryState((state) => (state ? undoHistoryState(state) : state));
  }, []);

  const redo = useCallback(() => {
    setHistoryState((state) => (state ? redoHistoryState(state) : state));
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (!(event.metaKey || event.ctrlKey)) return;
      const key = event.key.toLowerCase();
      if (key === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if (key === "y") {
        event.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [undo, redo]);

  const updateBlock = useCallback((id: string, patch: Partial<TimeBlock>) => {
    commitData((prev) =>
      prev
        ? {
            ...prev,
            timeBlocks: prev.timeBlocks.map((block) =>
              block.id === id ? { ...block, ...patch } : block
            ),
          }
        : prev
    );
  }, [commitData]);

  const toggleBlockDone = useCallback((id: string) => {
    commitData((prev) =>
      prev
        ? {
            ...prev,
            timeBlocks: prev.timeBlocks.map((block) =>
              block.id === id ? { ...block, done: !block.done } : block
            ),
          }
        : prev
    );
  }, [commitData]);

  const deleteBlock = useCallback((id: string) => {
    commitData((prev) =>
      prev
        ? {
            ...prev,
            timeBlocks: prev.timeBlocks.filter((block) => block.id !== id),
          }
        : prev
    );
  }, [commitData]);

  const saveBlock = useCallback(
    (draft: Partial<TimeBlock>, id?: string) => {
      commitData((prev) => {
        if (!prev) return prev;
        const block: TimeBlock = {
          id: id ?? uid(),
          name: draft.name ?? "未命名事项",
          date: draft.date ?? todayKey(),
          start: draft.start ?? 9 * 60,
          end: draft.end ?? 10 * 60,
          category: draft.category ?? "work",
          location: draft.location,
          done: draft.done ?? false,
          status: draft.status ?? "scheduled",
          taskId: draft.taskId,
          obsidianVault: draft.obsidianVault,
          obsidianNote: draft.obsidianNote,
        };
        if (id) {
          return {
            ...prev,
            timeBlocks: prev.timeBlocks.map((item) =>
              item.id === id ? { ...item, ...block } : item
            ),
          };
        }
        return { ...prev, timeBlocks: [...prev.timeBlocks, block] };
      });
    },
    [commitData]
  );

  const addParsedBlocks = useCallback((parsed: ParsedSchedule[]) => {
    commitData((prev) =>
      prev
        ? {
            ...prev,
            timeBlocks: [
              ...prev.timeBlocks,
              ...parsed.map<ParsedSchedule & TimeBlock>((item) => ({
                ...item,
                id: uid(),
                done: false,
                status: "scheduled",
              })),
            ],
          }
        : prev
    );
    const first = parsed[0];
    if (first) {
      setWeekOffset(weekOffsetForDate(first.date));
      setFocusTarget({
        date: first.date,
        start: first.start,
        end: first.end,
      });
      if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
      focusTimerRef.current = setTimeout(() => setFocusTarget(null), 2000);
    }
  }, [commitData]);

  const saveObsidianVault = useCallback((obsidianVault: string) => {
    commitData((prev) =>
      prev
        ? {
            ...prev,
            settings: {
              ...prev.settings,
              obsidianVault: obsidianVault || undefined,
            },
          }
        : prev
    );
  }, [commitData]);

  const handleOpenObsidian = useCallback(
    (block: TimeBlock) => {
      const vault = block.obsidianVault || data?.settings?.obsidianVault;
      if (!vault) {
        setSettingsOpen(true);
        return;
      }
      window.location.href = buildObsidianUrl(vault, block.obsidianNote);
    },
    [data]
  );

  const openNewBlockAt = useCallback((date: string, start: number) => {
    setNewBlockTime({ date, start });
    setEditingBlock(null);
    setBlockModalOpen(true);
  }, []);

  const addTasks = useCallback((names: string[]) => {
    commitData((prev) =>
      prev
        ? {
            ...prev,
            tasks: [
              ...prev.tasks,
              ...names.map<Task>((name) => ({
                id: uid(),
                name,
                date: null,
                status: "todo",
                subtasks: [],
                pinned: false,
              })),
            ],
          }
        : prev
    );
  }, [commitData]);

  const saveTask = useCallback((draft: Partial<Task>, id?: string) => {
    commitData((prev) => {
      if (!prev) return prev;
      const task: Task = {
        id: id ?? uid(),
        name: draft.name ?? "未命名任务",
        date: draft.date ?? null,
        status: draft.status ?? "todo",
        subtasks: draft.subtasks ?? [],
        pinned: draft.pinned ?? false,
      };
      if (id) {
        return {
          ...prev,
          tasks: prev.tasks.map((item) =>
            item.id === id
              ? {
                  ...item,
                  name: task.name,
                  date: task.date,
                  status: task.status,
                  subtasks: task.subtasks,
                  pinned: draft.pinned ?? item.pinned ?? false,
                }
              : item
          ),
        };
      }
      return { ...prev, tasks: [...prev.tasks, task] };
    });
  }, [commitData]);

  const reorderTask = useCallback(
    (fromTaskId: string, toTaskId: string, before: boolean) => {
      commitData((prev) => {
        if (!prev) return prev;
        const fromIndex = prev.tasks.findIndex((t) => t.id === fromTaskId);
        const toIndex = prev.tasks.findIndex((t) => t.id === toTaskId);
        if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return prev;
        const tasks = [...prev.tasks];
        const [moved] = tasks.splice(fromIndex, 1);
        let insertIndex = tasks.findIndex((t) => t.id === toTaskId);
        if (insertIndex < 0) insertIndex = tasks.length;
        if (!before) insertIndex += 1;
        tasks.splice(insertIndex, 0, moved);
        return { ...prev, tasks };
      });
    },
    [commitData]
  );

  const toggleTaskPinned = useCallback((taskId: string) => {
    commitData((prev) =>
      prev
        ? {
            ...prev,
            tasks: prev.tasks.map((task) =>
              task.id === taskId
                ? { ...task, pinned: !(task.pinned ?? false) }
                : task
            ),
          }
        : prev
    );
  }, [commitData]);

  const deleteTask = useCallback((id: string) => {
    commitData((prev) =>
      prev
        ? {
            ...prev,
            tasks: prev.tasks.filter((task) => task.id !== id),
            timeBlocks: prev.timeBlocks.filter(
              (block) => block.taskId !== id
            ),
          }
        : prev
    );
  }, [commitData]);

  const moveTask = useCallback((taskId: string, dateKey: string) => {
    commitData((prev) => {
      if (!prev) return prev;
      const tasks = prev.tasks.map((task) =>
        task.id === taskId ? { ...task, date: dateKey } : task
      );
      const pending = prev.timeBlocks.find(
        (block) => block.taskId === taskId && block.status === "pending"
      );
      const task = prev.tasks.find((item) => item.id === taskId);
      let timeBlocks = prev.timeBlocks;
      if (pending) {
        timeBlocks = timeBlocks.map((block) =>
          block.id === pending.id ? { ...block, date: dateKey } : block
        );
      } else if (task) {
        timeBlocks = [
          ...timeBlocks,
          {
            id: uid(),
            taskId,
            name: task.name,
            date: dateKey,
            start: 0,
            end: 60,
            category: "life" as const,
            done: false,
            status: "pending" as const,
          },
        ];
      }
      return { ...prev, tasks, timeBlocks };
    });
  }, [commitData]);

  const toggleSubtask = useCallback((taskId: string, subtaskId: string) => {
    commitData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        tasks: prev.tasks.map((task) =>
          task.id === taskId
            ? {
                ...task,
                subtasks: task.subtasks.map((sub) =>
                  sub.id === subtaskId ? { ...sub, done: !sub.done } : sub
                ),
              }
            : task
        ),
      };
    });
  }, [commitData]);

  const addSubtaskBlock = useCallback(
    (taskId: string, subtaskName: string, dateKey: string) => {
      commitData((prev) => {
        if (!prev) return prev;
        const newBlock = {
          id: uid(),
          taskId,
          name: subtaskName,
          date: dateKey,
          start: 9 * 60,
          end: 10 * 60,
          category: "life" as const,
          done: false,
          status: "pending" as const,
        };
        return { ...prev, timeBlocks: [...prev.timeBlocks, newBlock] };
      });
    },
    [commitData]
  );

  const days = getWeekDays(weekOffset);

  /* 苹果日历导出暂未启用
  const downloadWeekICS = useCallback(() => {
    if (!data) return;
    const ics = buildWeekICS(data.timeBlocks, days);
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `AI日程-${days[0].key}.ics`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }, [data, days, weekOffset]);
  */

  if (!data || !hydrated) {
    return (
      <main className="flex min-h-screen items-center justify-center text-sm text-slate-400">
        加载中...
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-[1480px] flex-col px-3 py-3 sm:px-5">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-blue-600 text-white">
            <CalendarRange size={17} />
          </div>
          <div>
            <h1 className="text-sm font-bold leading-tight text-slate-800">
              AI 日程
            </h1>
            <p className="text-[10px] leading-tight text-slate-400">
              宏观拆解 · 微观执行
            </p>
          </div>
        </div>

        <div className="flex rounded-md border border-slate-200 bg-white p-0.5 shadow-sm">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setView(tab.key)}
                className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium transition ${
                  view === tab.key
                    ? "bg-slate-800 text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                <Icon size={14} />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={undo}
            disabled={!historyState || historyState.past.length === 0}
            title="撤销 (⌘Z)"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Undo2 size={14} />
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={!historyState || historyState.future.length === 0}
            title="重做 (⇧⌘Z)"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Redo2 size={14} />
          </button>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            title="设置"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 shadow-sm hover:bg-slate-50"
          >
            <Settings size={14} />
          </button>
          <span
            className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium ${
              syncState === "supabase"
                ? "bg-emerald-50 text-emerald-700"
                : "bg-slate-100 text-slate-500"
            }`}
          >
            {syncState === "supabase" ? (
              <Cloud size={12} />
            ) : (
              <CloudOff size={12} />
            )}
            {syncState === "supabase"
              ? "云端同步"
              : syncState === "loading"
                ? "连接中"
                : "本地模式"}
          </span>
        </div>
      </header>

      {view === "week" && (
        <div className="flex h-[calc(100vh-170px)] min-h-[560px] flex-1 flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setWeekOffset((offset) => offset - 1)}
                className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-600 shadow-sm hover:bg-slate-50"
                title="上一周"
              >
                <ChevronLeft size={15} />
              </button>
              <span className="min-w-44 text-center text-sm font-semibold text-slate-700">
                {formatWeekRange(weekOffset)}
              </span>
              <button
                type="button"
                onClick={() => setWeekOffset((offset) => offset + 1)}
                className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-600 shadow-sm hover:bg-slate-50"
                title="下一周"
              >
                <ChevronRight size={15} />
              </button>
              <button
                type="button"
                onClick={() => setWeekOffset(0)}
                className="ml-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 shadow-sm hover:bg-slate-50"
              >
                本周
              </button>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                disabled
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-400 shadow-sm disabled:cursor-not-allowed"
                title="导出功能暂未启用"
              >
                <CalendarPlus size={14} />
                导出日历
              </button>
            </div>
          </div>

          <QuickAdd onAddParsed={addParsedBlocks} />

          <WeekTimeline
            days={getWeekDays(weekOffset)}
            blocks={data.timeBlocks}
            obsidianVault={data.settings?.obsidianVault}
            focusTarget={focusTarget}
            onFocusHandled={() => setFocusTarget(null)}
            onUpdateBlock={updateBlock}
            onToggleDone={toggleBlockDone}
            onAddAt={openNewBlockAt}
            onOpenObsidian={handleOpenObsidian}
            onEditBlock={(block) => {
              setEditingBlock(block);
              setBlockModalOpen(true);
            }}
          />
        </div>
      )}

      {view === "board" && (
        <TaskBoard
          data={data}
          days={getWeekDays(weekOffset)}
          obsidianVault={data.settings?.obsidianVault}
          onMoveTask={moveTask}
          onEditTask={(task) => {
            setEditingTask(task);
            setTaskModalOpen(true);
          }}
          onNewTask={() => {
            setEditingTask(null);
            setTaskModalOpen(true);
          }}
          onAddTasks={addTasks}
          onToggleSubtask={toggleSubtask}
          onAddSubtaskBlock={addSubtaskBlock}
          onReorderTask={reorderTask}
          onToggleTaskPinned={toggleTaskPinned}
          onEditBlock={(block) => {
            setEditingBlock(block);
            setBlockModalOpen(true);
          }}
          onToggleBlockDone={toggleBlockDone}
          onOpenObsidian={handleOpenObsidian}
        />
      )}

      {view === "stats" && <StatsView data={data} days={days} />}

      {blockModalOpen && (
        <BlockModal
          block={editingBlock}
          defaultDate={newBlockTime?.date ?? todayKey()}
          defaultStart={newBlockTime?.start}
          defaultObsidianVault={data.settings?.obsidianVault}
          tasks={data.tasks.map((task) => ({ id: task.id, name: task.name }))}
          onSave={saveBlock}
          onDelete={deleteBlock}
          onClose={() => {
            setBlockModalOpen(false);
            setNewBlockTime(null);
          }}
        />
      )}

      {settingsOpen && (
        <SettingsModal
          obsidianVault={data.settings?.obsidianVault ?? ""}
          onSave={saveObsidianVault}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {taskModalOpen && (
        <TaskModal
          task={editingTask}
          defaultDate={todayKey()}
          onSave={saveTask}
          onDelete={deleteTask}
          onClose={() => setTaskModalOpen(false)}
        />
      )}
    </main>
  );
}
