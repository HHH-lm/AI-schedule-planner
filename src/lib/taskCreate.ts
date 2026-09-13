import { DEFAULT_TASK_PRIORITY, normalizeQuadrant } from "./priorities";
import { uid } from "./storage";
import type { Subtask, Task, TaskQuadrant } from "./types";

export type TaskSeed =
  | {
      name: string;
      subtasks?: string[];
      priority?: TaskQuadrant;
      /** 统一应用到该任务全部子任务的截止日期 */
      subtaskDeadline?: string;
    }
  | string;

/**
 * 由种子构建任务：未排期、待办、默认优先级、不置顶，
 * 与任务看板手动新建同一组默认值。
 */
export function buildTasksFromSeeds(seeds: readonly TaskSeed[]): Task[] {
  return seeds.map<Task>((seed) => {
    const name = typeof seed === "string" ? seed : seed.name;
    const subtaskNames = typeof seed === "string" ? [] : (seed.subtasks ?? []);
    const priority =
      typeof seed === "string"
        ? DEFAULT_TASK_PRIORITY
        : normalizeQuadrant(seed.priority);
    const subtaskDeadline =
      typeof seed === "string" ? undefined : seed.subtaskDeadline;
    const subtasks: Subtask[] = subtaskNames.map((subtask) => ({
      id: uid(),
      name: subtask,
      done: false,
      deadline: subtaskDeadline,
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
  });
}
