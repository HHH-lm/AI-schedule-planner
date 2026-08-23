import { describe, expect, it } from "vitest";
import type { Task } from "./types";
import { collectTodoSubtasks } from "./todaySubtasks";

const baseTask = (overrides: Partial<Task>): Task => ({
  id: "task-1",
  name: "项目",
  date: null,
  status: "todo",
  subtasks: [],
  priority: "important",
  ...overrides,
});

describe("今日待办未完成子任务", () => {
  it("只列出所有任务下的未完成子任务，不显示总任务", () => {
    const tasks: Task[] = [
      baseTask({
        id: "t1",
        name: "写报告",
        subtasks: [
          { id: "s1", name: "收集数据", done: false },
          { id: "s2", name: "整理结论", done: true },
        ],
      }),
      baseTask({
        id: "t2",
        name: "学习",
        status: "todo",
        subtasks: [{ id: "s3", name: "看书", done: false }],
      }),
      baseTask({
        id: "t3",
        name: "已完成项目",
        status: "done",
        subtasks: [{ id: "s4", name: "收尾", done: false }],
      }),
    ];

    const items = collectTodoSubtasks(tasks);
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.subtask.name)).toEqual(["收集数据", "看书"]);
    expect(items.map((i) => i.task.name)).toEqual(["写报告", "学习"]);
    expect(items.some((i) => i.task.id === "t3")).toBe(false);
  });

  it("无未完成子任务时返回空列表", () => {
    const tasks: Task[] = [
      baseTask({
        id: "t1",
        subtasks: [
          { id: "s1", name: "完成", done: true },
          { id: "s2", name: "也完成", done: true },
        ],
      }),
    ];
    expect(collectTodoSubtasks(tasks)).toEqual([]);
  });
});
