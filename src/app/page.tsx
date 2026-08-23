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
  ListTodo,
  ListChecks,
  LogIn,
  LogOut,
  Plus,
  Redo2,
  Settings,
  Undo2,
  User,
} from "lucide-react";
import type {
  AIMemorySuggestion,
  AiProviderSetting,
  AppData,
  Category,
  Memory,
  MemoryCategory,
  ParsedSchedule,
  PlanningWeights,
  Subtask,
  Task,
  TaskQuadrant,
  TimeBlock,
  ViewMode,
} from "@/lib/types";
import {
  DEFAULT_PLANNING_WEIGHTS,
  normalizePlanningWeights,
} from "@/lib/planningWeights";
import {
  addDays,
  filterByDateWindow,
  formatWeekRange,
  getWeekDays,
  defaultRemindAtISO,
  parseDateKey,
  toDateKey,
  todayKey,
  weekOffsetForDate,
} from "@/lib/date";
import {
  loadLocalData,
  saveLocalData,
  uid,
} from "@/lib/storage";
import { apiPost } from "@/lib/api";
import { DEFAULT_TASK_PRIORITY, normalizeQuadrant } from "@/lib/priorities";
import {
  getSession,
  isSupabaseConfigured,
  loadRemoteData,
  onAuthStateChange,
  saveRemoteData,
  signOutUser,
} from "@/lib/supabase";
import { logInfo } from "@/lib/logger";
import { makeSampleData } from "@/lib/sample";
// import { buildWeekICS } from "@/lib/ics"; // 苹果日历导出暂未启用
import WeekTimeline from "@/components/WeekTimeline";
import TodayView from "@/components/TodayView";
import QuickAdd from "@/components/QuickAdd";
import BlockModal from "@/components/BlockModal";
import TaskBoard from "@/components/TaskBoard";
import TaskModal from "@/components/TaskModal";
import StatsView from "@/components/StatsView";
import SettingsModal from "@/components/SettingsModal";
import AuthModal from "@/components/AuthModal";
import ConfirmDialog from "@/components/ConfirmDialog";
import ConflictModal from "@/components/ConflictModal";
import MemoryModal from "@/components/MemoryModal";
import AccountModal from "@/components/AccountModal";
import { buildObsidianUrl } from "@/lib/obsidian";
import {
  syncBlockDoneToSubtask,
  syncBlockToTask,
  syncSubtaskRenameToBlocks,
} from "@/lib/taskBlockSync";
import {
  commitHistoryState,
  createHistoryState,
  redoHistoryState,
  undoHistoryState,
  type HistoryState,
} from "@/lib/history";

const MEMORY_ANALYSIS_HORIZON_DAYS = 14; // 记忆分析回溯窗口，前后端保持一致

const TABS: Array<{
  key: ViewMode;
  label: string;
  icon: typeof CalendarRange;
}> = [
  { key: "today", label: "今日", icon: ListTodo },
  { key: "week", label: "周计划", icon: CalendarRange },
  { key: "board", label: "任务看板", icon: ClipboardList },
  { key: "stats", label: "统计周报", icon: BarChart3 },
];

type BlockDraft = Partial<TimeBlock> & { syncTask?: boolean };

const ensureTaskForName = (
  name: string,
  tasks: Task[]
): { taskId: string | undefined } => {
  const trimmed = name.trim() || "未命名事项";
  const matched = tasks.find(
    (task) => task.name.includes(trimmed) || trimmed.includes(task.name)
  );
  return { taskId: matched?.id };
};

export default function Home() {
  const [historyState, setHistoryState] = useState<HistoryState<AppData> | null>(
    null
  );
  const data = historyState?.present ?? null;
  const [hydrated, setHydrated] = useState(false);
  const [view, setView] = useState<ViewMode>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("app-view");
      if (saved === "today" || saved === "week" || saved === "board" || saved === "stats") {
        return saved as ViewMode;
      }
    }
    return "today";
  });
  const [weekOffset, setWeekOffset] = useState(0);
  const [batchMode, setBatchMode] = useState(false);
  const [syncState, setSyncState] = useState<"loading" | "local" | "supabase">(
    "loading"
  );
  const [user, setUser] = useState<{ id: string; email: string } | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [signOutConfirmOpen, setSignOutConfirmOpen] = useState(false);
  const [editingBlock, setEditingBlock] = useState<TimeBlock | null>(null);
  const [blockModalOpen, setBlockModalOpen] = useState(false);
  const [newBlockTime, setNewBlockTime] = useState<{
    date: string;
    start: number;
  } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [conflicts, setConflicts] = useState<ParsedSchedule[]>([]);
  const [conflictModalOpen, setConflictModalOpen] = useState(false);
  const [memoryModalOpen, setMemoryModalOpen] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [focusTarget, setFocusTarget] = useState<{
    date: string;
    start: number;
    end: number;
  } | null>(null);
  const focusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 自动关闭 toast 提示
  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => setToastMessage(null), 3000);
    return () => clearTimeout(timer);
  }, [toastMessage]);


  const dataRef = useRef<AppData | null>(null);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  // Persist current view across page refreshes
  useEffect(() => {
    localStorage.setItem("app-view", view);
  }, [view]);

  useEffect(() => {
    if (!hydrated || view !== "week") return;
    setWeekOffset(0);
    const now = new Date();
    setFocusTarget({
      date: todayKey(),
      start: now.getHours() * 60 + now.getMinutes(),
      end: now.getHours() * 60 + now.getMinutes() + 60,
    });
  }, [hydrated, view]);

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
        const { data: sessionData } = await getSession();
        if (sessionData.session) {
          const session = sessionData.session;
          setUser({ id: session.user.id, email: session.user.email ?? "" });
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

  // One-time sync: update subtask done status to match time blocks
  useEffect(() => {
    if (!data) return;
    let needsSync = false;
    const updatedTasks = data.tasks.map((task) => {
      const updatedSubtasks = task.subtasks.map((sub) => {
        // Try matching by subtaskId first, then by name
        const matchedBlock = data.timeBlocks.find(
          (b) =>
            b.subtaskId === sub.id ||
            b.name === sub.name ||
            b.name.includes(sub.name) ||
            sub.name.includes(b.name)
        );
        if (matchedBlock && matchedBlock.done !== sub.done) {
          needsSync = true;
          return { ...sub, done: matchedBlock.done };
        }
        return sub;
      });
      return { ...task, subtasks: updatedSubtasks };
    });
    if (needsSync) {
      commitData((prev) => {
        if (!prev) return prev;
        return { ...prev, tasks: updatedTasks };
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  useEffect(() => {
    const { unsubscribe } = onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN") {
        const nextUser = session?.user
          ? { id: session.user.id, email: session.user.email ?? "" }
          : null;
        setUser(nextUser);
        setSyncState("supabase");
        if (nextUser) {
          void (async () => {
            const remote = await loadRemoteData();
            if (remote) {
              setHistoryState((state) =>
                state ? createHistoryState(remote) : state
              );
            } else if (dataRef.current) {
              await saveRemoteData(dataRef.current);
            }
          })();
        }
      } else if (event === "SIGNED_OUT") {
        setUser(null);
        setSyncState("local");
      }
    });
    return unsubscribe;
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
    commitData((prev) => {
      if (!prev) return prev;
      const block = prev.timeBlocks.find((b) => b.id === id);
      if (!block) return prev;
      const newDone = !block.done;
      const synced = syncBlockDoneToSubtask(prev.tasks, block, newDone);
      return {
        ...prev,
        timeBlocks: prev.timeBlocks.map((b) =>
          b.id === id
            ? { ...b, done: newDone, subtaskId: synced.subtaskId ?? b.subtaskId }
            : b
        ),
        tasks: synced.tasks,
      };
    });
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

  const deleteBlocks = useCallback((ids: string[]) => {
    commitData((prev) =>
      prev
        ? {
            ...prev,
            timeBlocks: prev.timeBlocks.filter((block) => !ids.includes(block.id)),
          }
        : prev
    );
  }, [commitData]);

  const saveBlock = useCallback(
    async (draft: BlockDraft, id?: string) => {
      const current = dataRef.current;
      if (!current) return;
      const name = draft.name ?? "未命名事项";
      const existingBlock = id
        ? current.timeBlocks.find((block) => block.id === id)
        : undefined;
      let taskId = draft.taskId;
      if (
        !taskId &&
        draft.syncTask !== false &&
        (!existingBlock || !existingBlock.taskId)
      ) {
        try {
          const result = await apiPost<{
            source: string;
            taskId: string | null;
          }>("/match-task", {
            name,
            tasks: current.tasks.map((t) => ({ id: t.id, name: t.name })),
            provider: current.settings?.aiProvider ?? "auto",
          });
          if (result.taskId) taskId = result.taskId;
        } catch {
          // API 失败，保持不关联
        }
      }
      const subtaskId = draft.subtaskId ?? existingBlock?.subtaskId;
      commitData((prev) => {
        if (!prev) return prev;
        const synced = syncBlockToTask(prev.tasks, {
          taskId: taskId ?? undefined,
          subtaskId: subtaskId ?? undefined,
          blockName: name,
          previousBlockName: existingBlock?.name,
        });
        const tasks = synced.tasks;
        const linkedSubtaskId = synced.subtaskId ?? subtaskId;
        const block: TimeBlock = {
          id: id ?? uid(),
          name,
          date: draft.date ?? todayKey(),
          start: draft.start ?? 9 * 60,
          end: draft.end ?? 10 * 60,
          category: draft.category ?? "work",
          location: draft.location,
          done: draft.done ?? false,
          status: draft.status ?? "scheduled",
          subtaskId: linkedSubtaskId,
          taskId,
          obsidianVault: draft.obsidianVault,
          obsidianNote: draft.obsidianNote,
          remindAt: draft.remindAt,
        };
        if (id) {
          return {
            ...prev,
            tasks,
            timeBlocks: prev.timeBlocks.map((item) =>
              item.id === id ? { ...item, ...block } : item
            ),
          };
        }
        return { ...prev, tasks, timeBlocks: [...prev.timeBlocks, block] };
      });
    },
    [commitData]
  );

  const addParsedBlocks = useCallback(
    async (parsed: ParsedSchedule[]): Promise<number> => {
    const current = dataRef.current;
    if (!current) return 0;
    let accepted = parsed;
    let blocked: ParsedSchedule[] = [];
    try {
      const result = await apiPost<{
        accepted: ParsedSchedule[];
        blocked: ParsedSchedule[];
      }>("/conflicts/check", {
        schedules: parsed,
        existing_blocks: current.timeBlocks.map((block) => ({
          date: block.date,
          start: block.start,
          end: block.end,
          status: block.status,
        })),
      });
      accepted = result.accepted;
      blocked = result.blocked;
    } catch (error) {
      throw error instanceof Error ? error : new Error("冲突检测失败");
    }
    if (accepted.length > 0) {
      const matchedTaskIds = new Map<string, string | undefined>();
      const currentTasks = current.tasks ?? [];
      // 批量 AI 匹配，逐个调用
      for (const block of accepted) {
        try {
          const result = await apiPost<{
            source: string;
            taskId: string | null;
          }>("/match-task", {
            name: block.name,
            tasks: currentTasks.map((t) => ({ id: t.id, name: t.name })),
            provider: current.settings?.aiProvider ?? "auto",
          });
          matchedTaskIds.set(block.name, result.taskId ?? undefined);
        } catch {
          matchedTaskIds.set(block.name, undefined);
        }
      }
      commitData((prev) => {
        if (!prev) return prev;
        let tasks = prev.tasks;
        const newBlocks = accepted.map<ParsedSchedule & TimeBlock>((item) => {
          const itemTaskId = matchedTaskIds.get(item.name);
          let itemSubtaskId: string | undefined;
          if (itemTaskId) {
            const taskIdx = tasks.findIndex((t) => t.id === itemTaskId);
            if (taskIdx >= 0) {
              const task = tasks[taskIdx];
              const existing = task.subtasks.find((s) => s.name === item.name);
              if (existing) {
                itemSubtaskId = existing.id;
              } else {
                const newSub = { id: uid(), name: item.name, done: false };
                itemSubtaskId = newSub.id;
                tasks = tasks.map((t) =>
                  t.id === itemTaskId
                    ? { ...t, subtasks: [...t.subtasks, newSub] }
                    : t
                );
              }
            }
          }
          return {
            ...item,
            id: uid(),
            taskId: itemTaskId,
            subtaskId: itemSubtaskId,
            done: false,
            status: "scheduled",
            remindAt: defaultRemindAtISO(item.date, item.start),
          };
        });
        return {
          ...prev,
          tasks,
          timeBlocks: [...prev.timeBlocks, ...newBlocks],
        };
      });
    }
    if (blocked.length > 0) {
      setConflicts(blocked);
      setConflictModalOpen(true);
    }
    const first = accepted[0];
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
    return accepted.length;
  },
  [commitData]
  );

  const saveMemory = useCallback((memory: Memory) => {
    commitData((prev) => {
      if (!prev) return prev;
      const existing = (prev.memories ?? []).findIndex((m) => m.id === memory.id);
      let memories: Memory[];
      if (existing >= 0) {
        memories = prev.memories!.map((m) =>
          m.id === memory.id ? memory : m
        );
      } else {
        memories = [...(prev.memories ?? []), memory];
      }
      return { ...prev, memories };
    });
  }, [commitData]);

  const deleteMemory = useCallback((id: string) => {
    commitData((prev) =>
      prev
        ? { ...prev, memories: (prev.memories ?? []).filter((m) => m.id !== id) }
        : prev
    );
  }, [commitData]);

  const acceptSuggestion = useCallback(
    (suggestion: AIMemorySuggestion) => {
      const conclusion = suggestion.conclusion || suggestion.content;
      
      // 检查是否已存在相同记忆
      const existing = data?.memories?.find(
        (m) => m.category === suggestion.category && m.content === conclusion
      );
      if (existing) {
        setToastMessage("此条记忆已经添加过，无需重复添加。");
        // 移除这条建议（效果同"忽略"）
        commitData((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            aiMemorySuggestions: (prev.aiMemorySuggestions ?? []).filter(
              (s) => s.id !== suggestion.id
            ),
          };
        });
        return;
      }
      
      const now = new Date().toISOString();
      const memory: Memory = {
        id: uid(),
        category: suggestion.category,
        content: conclusion,
        createdAt: now,
        updatedAt: now,
        source: "ai-suggested",
        status: "active",
      };
      commitData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          memories: [...(prev.memories ?? []), memory],
          aiMemorySuggestions: (prev.aiMemorySuggestions ?? []).filter(
            (s) => s.id !== suggestion.id
          ),
        };
      });
    },
    [commitData, data]
  );

  const runAnalysis = useCallback(async () => {
    if (!data) return;
    setIsAnalyzing(true);
    try {
      const result = await apiPost<{
        suggestions: Array<{
          id: string;
          category: string;
          content: string;
          conclusion: string;
          reasoning: string;
          confidence: number;
          createdAt: string;
        }>;
        message?: string | null;
      }>("/memories/analyze", {
        timeBlocks: filterByDateWindow(
          data.timeBlocks,
          MEMORY_ANALYSIS_HORIZON_DAYS
        ).map((block) => ({
          id: block.id,
          name: block.name,
          date: block.date,
          start: block.start,
          end: block.end,
          category: block.category,
          done: block.done,
        })),
        horizon_days: MEMORY_ANALYSIS_HORIZON_DAYS,
        today: toDateKey(new Date()),
      });
      if (result.suggestions.length === 0) {
        // 数据不足或未发现规律时，用弹窗提示用户原因
        setToastMessage(
          result.message ?? "暂未生成记忆建议，请确保有足够的时间块数据后重试。"
        );
      }
      const now = new Date().toISOString();
      commitData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          aiMemorySuggestions: result.suggestions.map((s) => ({
              id: s.id,
              category: s.category as MemoryCategory,
              content: s.content,
              conclusion: s.conclusion,
              reasoning: s.reasoning,
              confidence: s.confidence,
              createdAt: s.createdAt,
              status: "pending" as const,
            })),
        };
      });
    } catch {
      // 分析失败时静默，不阻塞用户操作
    } finally {
      setIsAnalyzing(false);
    }
  }, [data, commitData, setToastMessage]);

  const dismissSuggestion = useCallback((id: string) => {
    commitData((prev) =>
      prev
        ? {
            ...prev,
            aiMemorySuggestions: (prev.aiMemorySuggestions ?? []).filter(
              (s) => s.id !== id
            ),
          }
        : prev
    );
  }, [commitData]);

  const saveSettings = useCallback(
    (settings: {
      obsidianVault: string;
      aiProvider: AiProviderSetting;
      planningWeights: PlanningWeights;
    }) => {
      commitData((prev) =>
        prev
          ? {
              ...prev,
              settings: {
                ...prev.settings,
                obsidianVault: settings.obsidianVault || undefined,
                aiProvider: settings.aiProvider,
                planningWeights: normalizePlanningWeights(
                  settings.planningWeights
                ),
              },
            }
          : prev
      );
    },
    [commitData]
  );

  const toggleHiddenBoardWeek = useCallback(
    (weekKey: string) => {
      commitData((prev) => {
        if (!prev) return prev;
        const current = prev.settings?.hiddenBoardWeeks ?? [];
        const hidden = current.includes(weekKey);
        return {
          ...prev,
          settings: {
            ...prev.settings,
            hiddenBoardWeeks: hidden
              ? current.filter((key) => key !== weekKey)
              : [...current, weekKey],
          },
        };
      });
    },
    [commitData]
  );

  const saveTimelineCollapsedRanges = useCallback(
    (ranges: Array<{ start: number; end: number }>) => {
      commitData((prev) =>
        prev
          ? {
              ...prev,
              settings: {
                ...prev.settings,
                timelineCollapsedRanges: ranges.length > 0 ? ranges : undefined,
              },
            }
          : prev
      );
    },
    [commitData]
  );

  const openAccount = useCallback(() => {
    if (user) setAccountModalOpen(true);
    else setAuthModalOpen(true);
  }, [user]);

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

  const addTasks = useCallback(
    (
      seeds: Array<
        { name: string; subtasks?: string[]; priority?: TaskQuadrant } | string
      >
    ) => {
      commitData((prev) =>
        prev
          ? {
              ...prev,
              tasks: [
                ...prev.tasks,
                ...seeds.map<Task>((seed) => {
                  const name = typeof seed === "string" ? seed : seed.name;
                  const subtaskNames =
                    typeof seed === "string" ? [] : (seed.subtasks ?? []);
                  const priority =
                    typeof seed === "string"
                      ? DEFAULT_TASK_PRIORITY
                      : normalizeQuadrant(seed.priority);
                  const subtasks: Subtask[] = subtaskNames.map((subtask) => ({
                    id: uid(),
                    name: subtask,
                    done: false,
                  }));
                  return {
                    id: uid(),
                    name,
                    date: null,
                    status: "todo" as const,
                    subtasks,
                    priority,
                    pinned: false,
                  };
                }),
              ],
            }
          : prev
      );
    },
    [commitData]
  );

  const saveTask = useCallback((draft: Partial<Task>, id?: string) => {
    commitData((prev) => {
      if (!prev) return prev;
      const task: Task = {
        id: id ?? uid(),
        name: draft.name ?? "未命名任务",
        date: draft.date ?? null,
        status: draft.status ?? "todo",
        subtasks: draft.subtasks ?? [],
        priority: normalizeQuadrant(draft.priority),
        pinned: draft.pinned ?? false,
      };
      if (id) {
        const previous = prev.tasks.find((item) => item.id === id);
        const nextTask: Task = previous
          ? {
              ...previous,
              name: task.name,
              date: task.date,
              status: task.status,
              subtasks: task.subtasks,
              priority: normalizeQuadrant(
                draft.priority ?? previous.priority ?? DEFAULT_TASK_PRIORITY
              ),
              pinned: draft.pinned ?? previous.pinned ?? false,
            }
          : task;
        const timeBlocks = previous
          ? syncSubtaskRenameToBlocks(
              prev.timeBlocks,
              nextTask,
              previous.subtasks
            )
          : prev.timeBlocks;
        return {
          ...prev,
          timeBlocks,
          tasks: prev.tasks.map((item) =>
            item.id === id ? nextTask : item
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

  const moveTaskToToday = useCallback(
    (taskId: string) => {
      moveTask(taskId, todayKey());
    },
    [moveTask]
  );

  const toggleSubtask = useCallback((taskId: string, subtaskId: string) => {
    commitData((prev) => {
      if (!prev) return prev;
      // Find the subtask to determine new done state
      const task = prev.tasks.find((t) => t.id === taskId);
      const sub = task?.subtasks.find((s) => s.id === subtaskId);
      if (!sub) return prev;
      const newDone = !sub.done;
      return {
        ...prev,
        tasks: prev.tasks.map((task) =>
          task.id === taskId
            ? {
                ...task,
                subtasks: task.subtasks.map((sub) =>
                  sub.id === subtaskId ? { ...sub, done: newDone } : sub
                ),
              }
            : task
        ),
        timeBlocks: prev.timeBlocks.map((block) =>
          block.subtaskId === subtaskId
            ? { ...block, done: newDone }
            : block
        ),
      };
    });
  }, [commitData]);

  const addSubtaskBlock = useCallback(
    (taskId: string, subtaskId: string, subtaskName: string, dateKey: string) => {
      commitData((prev) => {
        if (!prev) return prev;
        const newBlock = {
          id: uid(),
          taskId,
          subtaskId,
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

  const planTasks = useCallback(
    async (
      tasks: Task[]
    ): Promise<{
      added: number;
      blockedCount: number;
      message?: string | null;
    }> => {
      const current = dataRef.current;
      if (!current) return { added: 0, blockedCount: 0 };
      const allMemories = current.memories ?? [];
      const memories = allMemories
        .filter((m) => m.status !== "archived")
        .map((m) => m.content);
      // 长期约束（long-term-constraint 类型记忆）作为硬约束传给规划器
      const constraints = allMemories
        .filter((m) => m.status !== "archived" && m.category === "long-term-constraint")
        .map((m) => m.content);
      const rangeStart = todayKey();
      const rangeEnd = toDateKey(addDays(parseDateKey(rangeStart), 13));
      // 只规划子任务：子任务是真正要执行的工作项
      // - 跳过没有子任务的任务（只有任务名不规划）
      // - 跳过已勾选完成的子任务
      const planInputs = tasks
        .filter((task) => task.subtasks.length > 0) // 跳过空子任务的任务
        .flatMap((task) =>
          task.subtasks
            .filter((sub) => !sub.done) // 跳过已完成的子任务
            .map((sub) => ({
              title: sub.name,
              duration: 60,
              priority: task.priority === "urgent-important" ? "high" : "auto",
              deadline: task.date ?? undefined,
              task_id: task.id,
              subtask_id: sub.id,
            }))
        );

      if (planInputs.length === 0) {
        return {
          added: 0,
          blockedCount: 0,
          message: "没有需要规划的子任务（请添加未完成的子任务）",
        };
      }

      const result = await apiPost<{
        source: "openai" | "deepseek" | "local" | "none";
        blocks: Array<{
          title: string;
          date: string;
          start: number;
          end: number;
          category: string;
          priority: string;
          task_id?: string;
          subtask_id?: string;
        }>;
        unassigned: string[];
        message?: string | null;
      }>("/plan-v2", {
        goal: "",
        tasks: planInputs,
        memories,
        constraints,
        now_minutes: new Date().getHours() * 60 + new Date().getMinutes(),
        existing_schedule: current.timeBlocks.map((block) => ({
          date: block.date,
          start: block.start,
          end: block.end,
          status: block.status,
        })),
        planning_range: { start: rangeStart, end: rangeEnd },
        weights: normalizePlanningWeights(
          current.settings?.planningWeights ?? DEFAULT_PLANNING_WEIGHTS
        ),
        provider: current.settings?.aiProvider ?? "auto",
      });
      if (result.source === "none") {
        throw new Error(result.message ?? "AI 规划失败，请稍后重试");
      }
      if (result.blocks.length > 0) {
        commitData((prev) =>
          prev
            ? {
                ...prev,
                timeBlocks: [
                  ...prev.timeBlocks,
                  ...result.blocks.map((block) => ({
                    id: uid(),
                    name: block.title,
                    date: block.date,
                    start: block.start,
                    end: block.end,
                    category: block.category as Category,
                    location: undefined,
                    done: false,
                    status: "scheduled" as const,
                    taskId: block.task_id ?? undefined,
                    subtaskId: block.subtask_id ?? undefined,
                    remindAt: defaultRemindAtISO(block.date, block.start),
                  })),
                ],
              }
            : prev
        );
      }
      return {
        added: result.blocks.length,
        blockedCount: result.unassigned.length,
        message: result.message,
      };
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
      <div className="loading-screen">
        <div className="flex items-center gap-2">
          <CalendarRange size={18} className="text-primary" />
          <span className="type-caption">加载中...</span>
        </div>
      </div>
    );
  }

  const currentTab = TABS.find((tab) => tab.key === view);
  const subTitle =
    view === "today" ? "今日待办" : view === "week" ? "周计划" : currentTab?.label ?? "AI日程";
  const subMeta =
    view === "today"
      ? "今天要做的安排与任务"
      : view === "week" || view === "stats"
        ? formatWeekRange(weekOffset)
        : "宏观拆解 · 拖拽排期";

  return (
    <div className="app-shell">
      <header className="global-nav">
        <div className="nav-brand">
          <span className="nav-brand-mark">
            <CalendarRange size={15} />
          </span>
          <span>AI日程</span>
        </div>

        <nav className="nav-links">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = view === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setView(tab.key)}
                className={`nav-link ${active ? "nav-link-active" : ""}`}
                aria-current={active ? "page" : undefined}
              >
                <Icon size={13} />
                <span className="nav-link-label">{tab.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="nav-actions">
          <button
            type="button"
            onClick={undo}
            disabled={!historyState || historyState.past.length === 0}
            title="撤销 (⌘Z)"
            className="nav-icon-btn"
          >
            <Undo2 size={14} />
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={!historyState || historyState.future.length === 0}
            title="重做 (⇧⌘Z)"
            className="nav-icon-btn"
          >
            <Redo2 size={14} />
          </button>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            title="设置"
            className="nav-icon-btn"
          >
            <Settings size={14} />
          </button>
          {user ? (
            <div className="nav-user">
              <User size={12} />
              <span>{user.email}</span>
              <button
                type="button"
                onClick={() => setSignOutConfirmOpen(true)}
                title="退出登录"
                className="icon-btn-plain !h-6 !w-6 text-white/70 hover:bg-white/10 hover:text-white"
              >
                <LogOut size={12} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAuthModalOpen(true)}
              title="登录以启用云同步"
              className="btn-dark-utility"
            >
              <LogIn size={14} />
              登录
            </button>
          )}
          <span
            className={`nav-sync ${
              syncState === "supabase" ? "nav-sync-on" : "nav-sync-off"
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

      <section className="sub-nav">
        <div className="sub-nav-left">
          <span className="sub-nav-title">{subTitle}</span>
          <span className="sub-nav-meta">{subMeta}</span>
        </div>
        <div className="sub-nav-actions">
          {view === "week" && (
            <>
              <button
                type="button"
                onClick={() => setWeekOffset((offset) => offset - 1)}
                className="chip-btn"
                title="上一周"
              >
                <ChevronLeft size={14} />
                上周
              </button>
              <button
                type="button"
                onClick={() => setWeekOffset(0)}
                className={`chip-btn ${weekOffset === 0 ? "chip-btn-active" : ""}`}
              >
                本周
              </button>
              <button
                type="button"
                onClick={() => setWeekOffset((offset) => offset + 1)}
                className="chip-btn"
                title="下一周"
              >
                下周
                <ChevronRight size={14} />
              </button>
              <button
                type="button"
                disabled
                className="btn-ghost hide-on-mobile"
                title="导出功能暂未启用"
              >
                <CalendarPlus size={14} />
                导出日历
              </button>
              <button
                type="button"
                onClick={() => setBatchMode((mode) => !mode)}
                className={`btn-ghost hide-on-mobile ${batchMode ? "btn-ghost-primary" : ""}`}
                title={batchMode ? "退出批量操作" : "勾选多个时间块后批量删除"}
              >
                <ListChecks size={14} />
                {batchMode ? "取消批量" : "批量操作"}
              </button>
              <button
                type="button"
                onClick={() =>
                  openNewBlockAt(
                    todayKey(),
                    new Date().getHours() * 60
                  )
                }
                className="btn-primary-pill"
              >
                <CalendarPlus size={16} />
                新建时间块
              </button>
            </>
          )}
          {view === "board" && (
            <button
              type="button"
              onClick={() => {
                setEditingTask(null);
                setTaskModalOpen(true);
              }}
              className="btn-primary-pill"
            >
              <Plus size={16} />
              新建任务
            </button>
          )}
          {view === "stats" && (
            <button type="button" disabled className="btn-primary-pill">
              <CalendarPlus size={16} />
              导出 Markdown
            </button>
          )}
        </div>
      </section>

      <main className="content-shell">
        {view === "today" && (
          <TodayView
            data={data}
            onToggleDone={toggleBlockDone}
            onEditBlock={(block) => {
              setEditingBlock(block);
              setBlockModalOpen(true);
            }}
            onEditTask={(task) => {
              setEditingTask(task);
              setTaskModalOpen(true);
            }}
            onMoveTaskToToday={moveTaskToToday}
            onOpenObsidian={handleOpenObsidian}
          />
        )}

        {view === "week" && (
          <div className="flex h-[calc(100vh-120px)] flex-col gap-4">
            <QuickAdd
              onAddParsed={addParsedBlocks}
              aiProvider={data.settings?.aiProvider ?? "auto"}
            />

            <WeekTimeline
              days={getWeekDays(weekOffset)}
              blocks={data.timeBlocks}
              collapsedRanges={data.settings?.timelineCollapsedRanges ?? []}
              onCollapsedRangesChange={saveTimelineCollapsedRanges}
              obsidianVault={data.settings?.obsidianVault}
              focusTarget={focusTarget}
              onFocusHandled={() => setFocusTarget(null)}
              batchMode={batchMode}
              onBatchModeChange={setBatchMode}
              onUpdateBlock={updateBlock}
              onToggleDone={toggleBlockDone}
              onAddAt={openNewBlockAt}
              onOpenObsidian={handleOpenObsidian}
              onDeleteBlocks={deleteBlocks}
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
          hiddenWeeks={data.settings?.hiddenBoardWeeks ?? []}
          onToggleHiddenWeek={toggleHiddenBoardWeek}
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
          onPlanTasks={planTasks}
        />
      )}

      {view === "stats" && <StatsView data={data} days={days} />}
      </main>

      <footer className="site-footer">
        <div className="site-footer-inner">
          <div className="site-footer-cols">
            <div>
              <div className="site-footer-heading">视图</div>
              <button
                type="button"
                onClick={() => setView("week")}
                className="site-footer-link"
              >
                周计划
              </button>
              <button
                type="button"
                onClick={() => setView("board")}
                className="site-footer-link"
              >
                任务看板
              </button>
              <button
                type="button"
                onClick={() => setView("stats")}
                className="site-footer-link"
              >
                统计周报
              </button>
            </div>
            <div>
              <div className="site-footer-heading">工具</div>
              <button
                type="button"
                onClick={() => setMemoryModalOpen(true)}
                className="site-footer-link"
              >
                记忆系统
              </button>
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                className="site-footer-link"
              >
                Obsidian 知识库
              </button>
              <button
                type="button"
                onClick={() => setView("board")}
                className="site-footer-link"
              >
                宏观任务拆解
              </button>
              <button
                type="button"
                onClick={() => setView("stats")}
                className="site-footer-link"
              >
                周报导出
              </button>
            </div>
            <div>
              <div className="site-footer-heading">数据</div>
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                className="site-footer-link"
              >
                本地存储
              </button>
              <button
                type="button"
                onClick={openAccount}
                className="site-footer-link"
              >
                云同步
              </button>
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                className="site-footer-link"
              >
                撤销历史
              </button>
            </div>
            <div>
              <div className="site-footer-heading">关于</div>
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                className="site-footer-link"
              >
                设置
              </button>
              <button
                type="button"
                onClick={openAccount}
                className="site-footer-link"
              >
                账号
              </button>
              <span className="site-footer-link">版本 0.1.0</span>
            </div>
          </div>
          <div className="site-footer-legal">
            © 2026 AI日程管理与个性化规划系统 · 数据默认保存在本地浏览器，可选 Supabase
            云同步。
          </div>
        </div>
      </footer>

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
          aiProvider={data.settings?.aiProvider ?? "auto"}
          planningWeights={
            data.settings?.planningWeights ?? DEFAULT_PLANNING_WEIGHTS
          }
          onSave={saveSettings}
          onClose={() => setSettingsOpen(false)}
          onOpenMemory={() => {
            setSettingsOpen(false);
            setMemoryModalOpen(true);
          }}
        />
      )}

      {authModalOpen && <AuthModal onClose={() => setAuthModalOpen(false)} />}

      {accountModalOpen && user && (
        <AccountModal
          email={user.email}
          onLogout={() => {
            setAccountModalOpen(false);
            setSignOutConfirmOpen(true);
          }}
          onClose={() => setAccountModalOpen(false)}
        />
      )}

      {conflictModalOpen && conflicts.length > 0 && (
        <ConflictModal
          conflicts={conflicts}
          onClose={() => setConflictModalOpen(false)}
        />
      )}

      {signOutConfirmOpen && (
        <ConfirmDialog
          title="退出登录"
          description="确定要退出当前账号吗？退出后将停止云端同步，本地数据仍会保留。"
          confirmLabel="确认退出"
          onConfirm={signOutUser}
          onClose={() => setSignOutConfirmOpen(false)}
        />
      )}

      {memoryModalOpen && (
        <MemoryModal
          memories={data.memories ?? []}
          suggestions={data.aiMemorySuggestions ?? []}
          onSave={saveMemory}
          onDelete={deleteMemory}
          onAcceptSuggestion={acceptSuggestion}
          onDismissSuggestion={dismissSuggestion}
          onRunAnalysis={runAnalysis}
          isAnalyzing={isAnalyzing}
          onClose={() => setMemoryModalOpen(false)}
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
      {toastMessage && (
        <div className="modal-backdrop" onMouseDown={() => setToastMessage(null)}>
          <div
            className="modal-card max-w-sm"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3 className="modal-title">提示</h3>
              <button
                type="button"
                onClick={() => setToastMessage(null)}
                className="icon-btn-plain"
                aria-label="关闭"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="modal-body">
              <p className="text-[15px] leading-relaxed text-ink-muted-80">{toastMessage}</p>
            </div>
            <div className="modal-footer !justify-end">
              <button
                type="button"
                onClick={() => setToastMessage(null)}
                className="btn-primary-pill"
              >
                知道了
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
