import type { Task, TaskQuadrant } from "./types";
import { normalizeQuadrant } from "./priorities";

/**
 * 看板未置顶任务的象限排列顺序：
 * 紧急重要 > 紧急不重要 > 不紧急重要 > 既不紧急也不重要。
 * 与 TodayView 布局用的 QUADRANT_ORDER（重要在前）刻意不同，互不影响。
 */
const BOARD_QUADRANT_RANK: Record<TaskQuadrant, number> = {
  "urgent-important": 0,
  urgent: 1,
  important: 2,
  neither: 3,
};

/**
 * 任务看板左侧列表的排序规则：
 * 1. 已完成（status === "done"）的任务始终沉到全列表最底部（不论是否置顶）；
 * 2. 未完成任务内置顶优先；
 * 3. 双方都未置顶的未完成任务按象限顺序排列（缺失/非法 priority 归入最后一档）；
 * 4. 其余保持数组原序（sort 稳定，同组内相对顺序不变）。
 */
export function orderTasks(tasks: Task[]): Task[] {
  return [...tasks].sort(
    (a, b) =>
      Number(a.status === "done") - Number(b.status === "done") ||
      Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) ||
      quadrantDiff(a, b),
  );
}

/**
 * 象限键只作用于双方都未置顶且未完成的任务对：
 * 置顶组内保持手动顺序，已完成组内保持原序。
 */
function quadrantDiff(a: Task, b: Task): number {
  if (a.pinned || b.pinned) return 0;
  if (a.status === "done" || b.status === "done") return 0;
  return (
    BOARD_QUADRANT_RANK[normalizeQuadrant(a.priority)] -
    BOARD_QUADRANT_RANK[normalizeQuadrant(b.priority)]
  );
}

/** 任务完成前的位置快照：用于反勾选时恢复原位置与置顶状态 */
export interface TaskDoneSnapshot {
  index: number;
  pinned: boolean;
}

/**
 * 标记任务完成：取消置顶（排序上沉底），并返回完成前的位置快照。
 * 任务不存在或已完成时返回 null。
 */
export function completeTask(
  tasks: Task[],
  taskId: string
): { tasks: Task[]; snapshot: TaskDoneSnapshot } | null {
  const index = tasks.findIndex((task) => task.id === taskId);
  if (index === -1) return null;
  const task = tasks[index];
  if (task.status === "done") return null;
  return {
    tasks: tasks.map((item, i) =>
      i === index ? { ...item, status: "done" as const, pinned: false } : item
    ),
    snapshot: { index, pinned: task.pinned ?? false },
  };
}

/**
 * 反勾选任务（恢复未完成）：
 * 有快照时按快照恢复数组位置与置顶状态（下标越界时取末位），
 * 无快照（如刷新后丢失）时保持当前位置与置顶不变。
 * 任务不存在或未完成时返回 null。
 */
export function reviveTask(
  tasks: Task[],
  taskId: string,
  snapshot?: TaskDoneSnapshot
): Task[] | null {
  const index = tasks.findIndex((task) => task.id === taskId);
  if (index === -1) return null;
  const task = tasks[index];
  if (task.status !== "done") return null;
  const revived: Task = {
    ...task,
    status: "todo",
    pinned: snapshot ? snapshot.pinned : task.pinned,
  };
  const next = [...tasks];
  next.splice(index, 1);
  const insertAt = snapshot ? Math.min(snapshot.index, next.length) : index;
  next.splice(insertAt, 0, revived);
  return next;
}
