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
  LogIn,
  LogOut,
  Plus,
  Redo2,
  Settings,
  Undo2,
  User,
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
import QuickAdd from "@/components/QuickAdd";
import BlockModal from "@/components/BlockModal";
import TaskBoard from "@/components/TaskBoard";
import TaskModal from "@/components/TaskModal";
import StatsView from "@/components/StatsView";
import SettingsModal from "@/components/SettingsModal";
import AuthModal from "@/components/AuthModal";
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
  const [user, setUser] = useState<{ id: string; email: string } | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
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
  const dataRef = useRef<AppData | null>(null);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

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
    view === "week"
      ? "周时间轴"
      : currentTab?.label ?? "AI 日程";
  const subMeta =
    view === "week" || view === "stats"
      ? formatWeekRange(weekOffset)
      : "宏观拆解 · 拖拽排期";

  return (
    <div className="app-shell">
      <header className="global-nav">
        <div className="nav-brand">
          <span className="nav-brand-mark">
            <CalendarRange size={15} />
          </span>
          <span>AI 日程</span>
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
                onClick={() => signOutUser()}
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
        {view === "week" && (
          <div className="flex h-[calc(100vh-236px)] min-h-[520px] flex-col gap-4">
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
                周时间轴
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
                onClick={() => setAuthModalOpen(true)}
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
                onClick={() => setAuthModalOpen(true)}
                className="site-footer-link"
              >
                账号
              </button>
              <span className="site-footer-link">版本 0.1.0</span>
            </div>
          </div>
          <div className="site-footer-legal">
            © 2026 AI 日程管理系统 · 数据默认保存在本地浏览器，可选 Supabase
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
          onSave={saveObsidianVault}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {authModalOpen && <AuthModal onClose={() => setAuthModalOpen(false)} />}

      {taskModalOpen && (
        <TaskModal
          task={editingTask}
          defaultDate={todayKey()}
          onSave={saveTask}
          onDelete={deleteTask}
          onClose={() => setTaskModalOpen(false)}
        />
      )}
    </div>
  );
}
