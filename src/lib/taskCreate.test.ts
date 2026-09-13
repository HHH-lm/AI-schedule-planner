import { describe, expect, it } from "vitest";
import { buildTasksFromSeeds } from "./taskCreate";
import type { TaskQuadrant } from "./types";

describe("buildTasksFromSeeds", () => {
  it("字符串 seed 使用默认值：待办、未排期、默认优先级、不置顶", () => {
    const [task] = buildTasksFromSeeds(["写周报"]);
    expect(task).toMatchObject({
      name: "写周报",
      date: null,
      status: "todo",
      subtasks: [],
      priority: "important",
      pinned: false,
    });
    expect(task.id).toBeTruthy();
  });

  it("对象 seed 可带子任务与优先级，子任务均未完成且带 id", () => {
    const [task] = buildTasksFromSeeds([
      {
        name: "搬家",
        subtasks: ["打包", "叫车"],
        priority: "urgent-important",
      },
    ]);
    expect(task.name).toBe("搬家");
    expect(task.priority).toBe("urgent-important");
    expect(task.subtasks.map((sub) => sub.name)).toEqual(["打包", "叫车"]);
    expect(
      task.subtasks.every((sub) => !sub.done && Boolean(sub.id))
    ).toBe(true);
  });

  it("subtaskDeadline 统一应用到该任务全部子任务", () => {
    const [task] = buildTasksFromSeeds([
      {
        name: "项目收尾",
        subtasks: ["验收", "归档"],
        subtaskDeadline: "2026-09-20",
      },
    ]);
    expect(task.subtasks.map((sub) => sub.deadline)).toEqual([
      "2026-09-20",
      "2026-09-20",
    ]);
  });

  it("非法优先级经 normalizeQuadrant 回退 neither", () => {
    const [task] = buildTasksFromSeeds([
      { name: "杂事", priority: "bogus" as unknown as TaskQuadrant },
    ]);
    expect(task.priority).toBe("neither");
  });

  it("对象 seed 未指定优先级时回退 neither（与既有 addTasks 行为一致）", () => {
    const [task] = buildTasksFromSeeds([{ name: "无优先级" }]);
    expect(task.priority).toBe("neither");
  });

  it("多条 seed 生成多个任务且 id 唯一", () => {
    const tasks = buildTasksFromSeeds(["a", { name: "b", subtasks: ["b1"] }]);
    expect(tasks).toHaveLength(2);
    expect(new Set(tasks.map((task) => task.id)).size).toBe(2);
    expect(new Set(tasks[1].subtasks.map((sub) => sub.id)).size).toBe(1);
  });

  it("空 seed 列表返回空数组", () => {
    expect(buildTasksFromSeeds([])).toEqual([]);
  });
});
