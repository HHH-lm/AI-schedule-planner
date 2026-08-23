import type { Subtask, Task } from "./types";

export interface TodaySubtask {
  task: Task;
  subtask: Subtask;
}

/** 今日待办只展示所有任务下的未完成子任务，不展示总任务。 */
export function collectTodoSubtasks(tasks: Task[]): TodaySubtask[] {
  return tasks
    .filter((task) => task.status !== "done")
    .flatMap((task) =>
      task.subtasks
        .filter((sub) => !sub.done)
        .map((subtask) => ({ task, subtask }))
    )
    .sort(
      (a, b) =>
        a.task.name.localeCompare(b.task.name, "zh-CN") ||
        a.subtask.name.localeCompare(b.subtask.name, "zh-CN")
    );
}
