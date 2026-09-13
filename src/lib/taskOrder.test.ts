import { describe, expect, it } from "vitest";
import { completeTask, orderTasks, reviveTask } from "./taskOrder";
import type { Task } from "./types";

function makeTask(
  id: string,
  overrides: Partial<Pick<Task, "status" | "pinned" | "priority">> = {},
): Task {
  return {
    id,
    name: `任务 ${id}`,
    date: null,
    status: "todo",
    subtasks: [],
    ...overrides,
  };
}

describe("任务看板排序", () => {
  it("未完成任务内置顶优先", () => {
    const tasks = [
      makeTask("a"),
      makeTask("b", { pinned: true }),
      makeTask("c"),
    ];
    expect(orderTasks(tasks).map((task) => task.id)).toEqual(["b", "a", "c"]);
  });

  it("已完成任务全列表沉底（排在置顶任务之后）", () => {
    const tasks = [
      makeTask("a"),
      makeTask("b", { status: "done" }),
      makeTask("c", { pinned: true }),
    ];
    expect(orderTasks(tasks).map((task) => task.id)).toEqual(["c", "a", "b"]);
  });

  it("置顶且已完成的任务同样沉底", () => {
    const tasks = [
      makeTask("a", { pinned: true, status: "done" }),
      makeTask("b"),
      makeTask("c", { pinned: true }),
    ];
    expect(orderTasks(tasks).map((task) => task.id)).toEqual(["c", "b", "a"]);
  });

  it("未完成任务保持原有相对顺序", () => {
    const tasks = [
      makeTask("c"),
      makeTask("a", { pinned: true }),
      makeTask("b"),
    ];
    expect(orderTasks(tasks).map((task) => task.id)).toEqual(["a", "c", "b"]);
  });

  it("已完成任务之间保持原有相对顺序", () => {
    const tasks = [
      makeTask("b", { status: "done" }),
      makeTask("a", { status: "done" }),
    ];
    expect(orderTasks(tasks).map((task) => task.id)).toEqual(["b", "a"]);
  });

  it("未置顶未完成任务按四象限顺序排列（紧急重要>紧急>重要>其他）", () => {
    const tasks = [
      makeTask("d", { priority: "neither" }),
      makeTask("b", { priority: "urgent" }),
      makeTask("a", { priority: "urgent-important" }),
      makeTask("c", { priority: "important" }),
    ];
    expect(orderTasks(tasks).map((task) => task.id)).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
  });

  it("同象限内保持原有相对顺序", () => {
    const tasks = [
      makeTask("c", { priority: "urgent" }),
      makeTask("a", { priority: "urgent-important" }),
      makeTask("b", { priority: "urgent" }),
    ];
    expect(orderTasks(tasks).map((task) => task.id)).toEqual(["a", "c", "b"]);
  });

  it("置顶组内不按象限排列（保持手动顺序）", () => {
    const tasks = [
      makeTask("a", { pinned: true, priority: "neither" }),
      makeTask("b", { pinned: true, priority: "urgent-important" }),
    ];
    expect(orderTasks(tasks).map((task) => task.id)).toEqual(["a", "b"]);
  });

  it("置顶任务整体排在象限区之前（置顶优先于象限）", () => {
    const tasks = [
      makeTask("a", { priority: "urgent-important" }),
      makeTask("b", { pinned: true, priority: "neither" }),
    ];
    expect(orderTasks(tasks).map((task) => task.id)).toEqual(["b", "a"]);
  });

  it("已完成任务之间不受象限影响（保持原序）", () => {
    const tasks = [
      makeTask("b", { status: "done", priority: "neither" }),
      makeTask("a", { status: "done", priority: "urgent-important" }),
    ];
    expect(orderTasks(tasks).map((task) => task.id)).toEqual(["b", "a"]);
  });

  it("缺失或非法 priority 归入最后一档（既不紧急也不重要）", () => {
    const tasks = [
      makeTask("a"),
      makeTask("b", { priority: "urgent" }),
      makeTask("c", { priority: "invalid" as unknown as Task["priority"] }),
    ];
    expect(orderTasks(tasks).map((task) => task.id)).toEqual(["b", "a", "c"]);
  });

  it("不修改原数组", () => {
    const tasks = [makeTask("a"), makeTask("b", { status: "done" })];
    orderTasks(tasks);
    expect(tasks.map((task) => task.id)).toEqual(["a", "b"]);
  });
});

describe("任务完成/反勾选快照", () => {
  it("完成时取消置顶，快照记录完成前的下标与置顶状态", () => {
    const tasks = [
      makeTask("a"),
      makeTask("b", { pinned: true }),
      makeTask("c"),
    ];
    const result = completeTask(tasks, "b");
    expect(result).not.toBeNull();
    expect(result!.snapshot).toEqual({ index: 1, pinned: true });
    expect(
      result!.tasks.map((t) => ({ id: t.id, status: t.status, pinned: t.pinned ?? false }))
    ).toEqual([
      { id: "a", status: "todo", pinned: false },
      { id: "b", status: "done", pinned: false },
      { id: "c", status: "todo", pinned: false },
    ]);
  });

  it("对已完成或不存在的任务完成操作返回 null", () => {
    expect(completeTask([makeTask("a", { status: "done" })], "a")).toBeNull();
    expect(completeTask([makeTask("a")], "missing")).toBeNull();
  });

  it("反勾选时按快照恢复原下标与置顶", () => {
    const tasks = [makeTask("a"), makeTask("b"), makeTask("c")];
    const done = completeTask(tasks, "b")!;
    // 完成期间 b 被拖到末尾
    const dragged = [...done.tasks];
    dragged.push(dragged.splice(1, 1)[0]);
    const revived = reviveTask(dragged, "b", done.snapshot)!;
    expect(revived.map((t) => t.id)).toEqual(["a", "b", "c"]);
    expect(revived[1].status).toBe("todo");
  });

  it("反勾选恢复置顶任务的图钉", () => {
    const tasks = [makeTask("a", { pinned: true }), makeTask("b")];
    const done = completeTask(tasks, "a")!;
    const revived = reviveTask(done.tasks, "a", done.snapshot)!;
    expect(revived[0].pinned).toBe(true);
    expect(revived[0].status).toBe("todo");
  });

  it("快照下标越界时收敛到末位", () => {
    const tasks = [makeTask("a"), makeTask("b", { status: "done" })];
    const revived = reviveTask(tasks, "b", { index: 9, pinned: false })!;
    expect(revived.map((t) => t.id)).toEqual(["a", "b"]);
  });

  it("无快照时反勾选保持当前位置与置顶", () => {
    const tasks = [
      makeTask("a"),
      makeTask("b", { status: "done", pinned: true }),
    ];
    const revived = reviveTask(tasks, "b")!;
    expect(revived.map((t) => t.id)).toEqual(["a", "b"]);
    expect(revived[1].status).toBe("todo");
    expect(revived[1].pinned).toBe(true);
  });

  it("对未完成或不存在的任务反勾选返回 null", () => {
    expect(reviveTask([makeTask("a")], "a")).toBeNull();
    expect(reviveTask([makeTask("a")], "missing")).toBeNull();
  });
});
