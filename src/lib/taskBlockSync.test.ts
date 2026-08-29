import { describe, expect, it } from "vitest";
import {
  syncBlockDeletionToTasks,
  syncBlockDoneToSubtask,
  syncBlockToTask,
  syncSubtaskRenameToBlocks,
} from "./taskBlockSync";
import type { Subtask, Task, TimeBlock } from "./types";

function makeSubtask(id: string, name: string): Subtask {
  return { id, name, done: false };
}

function makeTask(
  id: string,
  name: string,
  subtasks: Subtask[] = []
): Task {
  return {
    id,
    name,
    date: null,
    status: "todo",
    subtasks,
    pinned: false,
  };
}

function makeBlock(
  id: string,
  name: string,
  taskId?: string,
  subtaskId?: string
): TimeBlock {
  return {
    id,
    taskId,
    subtaskId,
    name,
    date: "2026-08-23",
    start: 540,
    end: 600,
    category: "work",
    done: false,
    status: "scheduled",
  };
}

describe("syncBlockToTask", () => {
  it("通过 subtaskId 保存时直接同步子任务名称", () => {
    const task = makeTask("t1", "做视频", [
      makeSubtask("s1", "写脚本"),
    ]);
    const result = syncBlockToTask([task], {
      taskId: "t1",
      subtaskId: "s1",
      blockName: "改脚本",
    });

    expect(result.tasks[0].subtasks[0].name).toBe("改脚本");
    expect(result.subtaskId).toBe("s1");
  });

  it("缺少 subtaskId 时按原块名找回子任务并同步改名", () => {
    const task = makeTask("t1", "做视频", [
      makeSubtask("s1", "写脚本"),
    ]);
    const result = syncBlockToTask([task], {
      taskId: "t1",
      blockName: "改脚本",
      previousBlockName: "写脚本",
    });

    expect(result.tasks[0].subtasks[0].name).toBe("改脚本");
    expect(result.subtaskId).toBe("s1");
  });

  it("新块名称与已有子任务相同时复用关联且不新建子任务", () => {
    const task = makeTask("t1", "做视频", [
      makeSubtask("s1", "写脚本"),
    ]);
    const result = syncBlockToTask([task], {
      taskId: "t1",
      blockName: "写脚本",
    });

    expect(result.tasks[0].subtasks).toHaveLength(1);
    expect(result.subtaskId).toBe("s1");
  });

  it("任务下没有匹配子任务时按原逻辑补一条", () => {
    const task = makeTask("t1", "做视频", []);
    const result = syncBlockToTask([task], {
      taskId: "t1",
      blockName: "剪辑素材",
    });

    expect(result.tasks[0].subtasks).toHaveLength(1);
    expect(result.tasks[0].subtasks[0].name).toBe("剪辑素材");
    expect(result.subtaskId).toBeDefined();
  });
});

describe("syncBlockDoneToSubtask", () => {
  it("subtaskId 失效时按任务与名称回退同步完成状态", () => {
    const task = makeTask("t1", "做视频", [
      makeSubtask("s1", "写脚本"),
    ]);
    const block = makeBlock("b1", "写脚本", "t1", "stale-id");

    const result = syncBlockDoneToSubtask([task], block, true);

    expect(result.tasks[0].subtasks[0].done).toBe(true);
    expect(result.subtaskId).toBe("s1");
  });

  it("缺少 subtaskId 时按任务下子任务名称同步", () => {
    const task = makeTask("t1", "做视频", [
      makeSubtask("s1", "写脚本"),
    ]);
    const block = makeBlock("b1", "脚本", "t1");

    const result = syncBlockDoneToSubtask([task], block, true);

    expect(result.tasks[0].subtasks[0].done).toBe(true);
    expect(result.subtaskId).toBe("s1");
  });

  it("无 taskId 时按名称在任意任务下同步", () => {
    const task = makeTask("t1", "做视频", [
      makeSubtask("s1", "写脚本"),
    ]);
    const block = makeBlock("b1", "写脚本");

    const result = syncBlockDoneToSubtask([task], block, true);

    expect(result.tasks[0].subtasks[0].done).toBe(true);
    expect(result.subtaskId).toBe("s1");
  });

  it("找不到匹配子任务时只更新时间块不新建子任务", () => {
    const task = makeTask("t1", "做视频", [
      makeSubtask("s1", "写脚本"),
    ]);
    const block = makeBlock("b1", "剪辑素材", "t1");

    const result = syncBlockDoneToSubtask([task], block, true);

    expect(result.tasks[0].subtasks[0].done).toBe(false);
    expect(result.tasks[0].subtasks).toHaveLength(1);
    expect(result.subtaskId).toBeUndefined();
  });
});

describe("syncBlockDeletionToTasks", () => {
  it("删除唯一引用某子任务的时间块时移除该子任务，任务保留", () => {
    const task = makeTask("t1", "做视频", [
      makeSubtask("s1", "写脚本"),
      makeSubtask("s2", "剪辑素材"),
    ]);
    const blocks = [
      makeBlock("b1", "写脚本", "t1", "s1"),
      makeBlock("b2", "剪辑素材", "t1", "s2"),
    ];

    const result = syncBlockDeletionToTasks(
      [task],
      [blocks[1]],
      [blocks[0]]
    );

    expect(result[0]).toMatchObject({ id: "t1", name: "做视频" });
    expect(result[0].subtasks.map((sub) => sub.id)).toEqual(["s2"]);
  });

  it("多个时间块共享同一子任务时，删除其一保留子任务", () => {
    const task = makeTask("t1", "做视频", [
      makeSubtask("s1", "写脚本"),
    ]);
    const blocks = [
      makeBlock("b1", "写脚本", "t1", "s1"),
      makeBlock("b2", "写脚本", "t1", "s1"),
    ];

    const result = syncBlockDeletionToTasks(
      [task],
      [blocks[1]],
      [blocks[0]]
    );

    expect(result[0].subtasks).toHaveLength(1);
    expect(result[0].subtasks[0].id).toBe("s1");
  });

  it("被删时间块没有 subtaskId 时任务保持不变", () => {
    const task = makeTask("t1", "做视频", [
      makeSubtask("s1", "写脚本"),
    ]);
    const block = makeBlock("b1", "写脚本", "t1");

    const result = syncBlockDeletionToTasks([task], [], [block]);

    expect(result).toEqual([task]);
  });

  it("批量删除多个时间块时只清理无剩余引用的子任务", () => {
    const task = makeTask("t1", "做视频", [
      makeSubtask("s1", "写脚本"),
      makeSubtask("s2", "剪辑素材"),
    ]);
    const blocks = [
      makeBlock("b1", "写脚本", "t1", "s1"),
      makeBlock("b2", "剪辑素材", "t1", "s2"),
      makeBlock("b3", "剪辑素材", "t1", "s2"),
    ];

    const result = syncBlockDeletionToTasks(
      [task],
      [blocks[2]],
      [blocks[0], blocks[1]]
    );

    expect(result[0].subtasks.map((sub) => sub.id)).toEqual(["s2"]);
  });

  it("删除未关联任何子任务的块时任务保持不变", () => {
    const task = makeTask("t1", "做视频", [
      makeSubtask("s1", "写脚本"),
    ]);
    const block = makeBlock("b1", "剪辑素材");

    const result = syncBlockDeletionToTasks([task], [], [block]);

    expect(result).toEqual([task]);
  });

  it("一个任务被清空移除时其他任务不受影响", () => {
    const taskA = makeTask("t1", "做视频", [
      makeSubtask("s1", "写脚本"),
    ]);
    const taskB = makeTask("t2", "读书", [
      makeSubtask("s2", "读第一章"),
    ]);
    const blocks = [
      makeBlock("b1", "写脚本", "t1", "s1"),
      makeBlock("b2", "读第一章", "t2", "s2"),
    ];

    const result = syncBlockDeletionToTasks(
      [taskA, taskB],
      [blocks[1]],
      [blocks[0]]
    );

    expect(result.map((task) => task.id)).toEqual(["t2"]);
    expect(result[0].subtasks).toHaveLength(1);
    expect(result[0].subtasks[0].id).toBe("s2");
  });

  it("任务下最后一个子任务被清理时整个任务一并移除", () => {
    const task = makeTask("t1", "做视频", [
      makeSubtask("s1", "写脚本"),
    ]);
    const block = makeBlock("b1", "写脚本", "t1", "s1");

    const result = syncBlockDeletionToTasks([task], [], [block]);

    expect(result).toEqual([]);
  });

  it("本次未发生子任务移除时已有任务不被误删", () => {
    const emptyTask = makeTask("t1", "做视频", []);
    const block = makeBlock("b1", "写脚本", "t1", "s-missing");

    const result = syncBlockDeletionToTasks([emptyTask], [], [block]);

    expect(result).toEqual([emptyTask]);
  });

  it("批量删除时一个任务被清空移除、另一个任务保留", () => {
    const taskA = makeTask("t1", "做视频", [
      makeSubtask("s1", "写脚本"),
    ]);
    const taskB = makeTask("t2", "读书", [
      makeSubtask("s2", "读第一章"),
      makeSubtask("s3", "读第二章"),
    ]);
    const blocks = [
      makeBlock("b1", "写脚本", "t1", "s1"),
      makeBlock("b2", "读第一章", "t2", "s2"),
      makeBlock("b3", "读第二章", "t2", "s3"),
    ];

    const result = syncBlockDeletionToTasks(
      [taskA, taskB],
      [blocks[2]],
      [blocks[0], blocks[1]]
    );

    expect(result.map((task) => task.id)).toEqual(["t2"]);
    expect(result[0].subtasks.map((sub) => sub.id)).toEqual(["s3"]);
  });
});

describe("syncSubtaskRenameToBlocks", () => {
  it("子任务改名同步到已关联与仅同名的时间块，不影响其他块", () => {
    const previous = makeTask("t1", "做视频", [
      makeSubtask("s1", "写脚本"),
    ]);
    const next = makeTask("t1", "做视频", [
      makeSubtask("s1", "改脚本"),
    ]);
    const blocks = [
      makeBlock("b1", "写脚本", "t1", "s1"),
      makeBlock("b2", "写脚本", "t1"),
      makeBlock("b3", "剪辑素材", "t1"),
    ];

    const result = syncSubtaskRenameToBlocks(
      blocks,
      next,
      previous.subtasks
    );

    expect(result[0]).toMatchObject({ id: "b1", name: "改脚本" });
    expect(result[1]).toMatchObject({
      id: "b2",
      name: "改脚本",
      subtaskId: "s1",
    });
    expect(result[2]).toMatchObject({ id: "b3", name: "剪辑素材" });
  });
});
