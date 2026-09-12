import { describe, expect, it } from "vitest";
import {
  syncBlockDeletionToTasks,
  syncBlockDoneToSubtask,
  syncBlockSaveToTasks,
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
  subtaskId?: string,
  done = false
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
    done,
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

  it("linkMoved 换绑时在新任务下新建子任务且不改旧子任务", () => {
    const taskA = makeTask("t1", "做视频", [makeSubtask("s1", "写脚本")]);
    const taskB = makeTask("t2", "读书", []);
    const result = syncBlockToTask([taskA, taskB], {
      taskId: "t2",
      subtaskId: "s1",
      blockName: "写脚本",
      linkMoved: true,
    });

    // 旧任务下的子任务不被改名或移除
    expect(result.tasks[0].subtasks).toHaveLength(1);
    expect(result.tasks[0].subtasks[0]).toMatchObject({
      id: "s1",
      name: "写脚本",
    });
    // 新任务下新建子任务并回链
    expect(result.tasks[1].subtasks).toHaveLength(1);
    expect(result.tasks[1].subtasks[0].name).toBe("写脚本");
    expect(result.subtaskId).toBe(result.tasks[1].subtasks[0].id);
    expect(result.subtaskId).not.toBe("s1");
  });

  it("linkMoved 换绑时新任务已有同名子任务则复用", () => {
    const taskA = makeTask("t1", "做视频", [makeSubtask("s1", "写脚本")]);
    const taskB = makeTask("t2", "读书", [makeSubtask("s2", "写脚本")]);
    const result = syncBlockToTask([taskA, taskB], {
      taskId: "t2",
      subtaskId: "s1",
      blockName: "写脚本",
      linkMoved: true,
    });

    // 复用新任务下的同名子任务，不新建
    expect(result.tasks[1].subtasks).toHaveLength(1);
    expect(result.subtaskId).toBe("s2");
    // 旧任务子任务不动
    expect(result.tasks[0].subtasks[0].id).toBe("s1");
  });
});

describe("共享子任务改名保护（otherBlocks）", () => {
  it("共享子任务的块改名时不劫持子任务名，改绑到新建子任务", () => {
    const task = makeTask("t1", "做视频", [makeSubtask("s1", "写脚本")]);
    const sibling = makeBlock("b1", "写脚本", "t1", "s1");

    const result = syncBlockToTask(
      [task],
      { taskId: "t1", subtaskId: "s1", blockName: "改稿" },
      [sibling]
    );

    // 共享子任务名不变，兄弟块绑定不受影响
    expect(result.tasks[0].subtasks[0]).toMatchObject({
      id: "s1",
      name: "写脚本",
    });
    // 新建子任务承载新名，改名块改绑过去
    expect(result.tasks[0].subtasks).toHaveLength(2);
    expect(result.tasks[0].subtasks[1].name).toBe("改稿");
    expect(result.subtaskId).toBe(result.tasks[0].subtasks[1].id);
  });

  it("共享子任务改名时任务下已有同名子任务则复用不新建", () => {
    const task = makeTask("t1", "做视频", [
      makeSubtask("s1", "写脚本"),
      makeSubtask("s2", "改稿"),
    ]);
    const sibling = makeBlock("b1", "写脚本", "t1", "s1");

    const result = syncBlockToTask(
      [task],
      { taskId: "t1", subtaskId: "s1", blockName: "改稿" },
      [sibling]
    );

    expect(result.subtaskId).toBe("s2");
    expect(result.tasks[0].subtasks).toHaveLength(2);
    expect(result.tasks[0].subtasks[0].name).toBe("写脚本");
  });

  it("共享子任务名字仅空格大小写差异时保持绑定不新建", () => {
    const task = makeTask("t1", "做视频", [makeSubtask("s1", "写脚本")]);
    const sibling = makeBlock("b1", "写脚本", "t1", "s1");

    const result = syncBlockToTask(
      [task],
      { taskId: "t1", subtaskId: "s1", blockName: "  写脚本  " },
      [sibling]
    );

    expect(result.tasks[0].subtasks).toHaveLength(1);
    expect(result.tasks[0].subtasks[0].name).toBe("写脚本");
    expect(result.subtaskId).toBe("s1");
  });

  it("独占子任务改名不受 otherBlocks 影响，照旧同步子任务名", () => {
    const task = makeTask("t1", "做视频", [
      makeSubtask("s1", "写脚本"),
      makeSubtask("s2", "剪辑素材"),
    ]);
    // 兄弟块引用的是另一个子任务，s1 独占
    const sibling = makeBlock("b1", "剪辑素材", "t1", "s2");

    const result = syncBlockToTask(
      [task],
      { taskId: "t1", subtaskId: "s1", blockName: "改稿" },
      [sibling]
    );

    expect(result.tasks[0].subtasks[0].name).toBe("改稿");
    expect(result.subtaskId).toBe("s1");
    expect(result.tasks[0].subtasks).toHaveLength(2);
  });

  it("previousBlockName 找回的子任务被共享时同样不劫持", () => {
    const task = makeTask("t1", "做视频", [makeSubtask("s1", "写脚本")]);
    const sibling = makeBlock("b1", "写脚本", "t1", "s1");

    const result = syncBlockToTask(
      [task],
      { taskId: "t1", blockName: "改稿", previousBlockName: "写脚本" },
      [sibling]
    );

    expect(result.tasks[0].subtasks[0]).toMatchObject({
      id: "s1",
      name: "写脚本",
    });
    expect(result.tasks[0].subtasks).toHaveLength(2);
    expect(result.subtaskId).not.toBe("s1");
    expect(result.subtaskId).toBe(result.tasks[0].subtasks[1].id);
  });

  it("syncBlockSaveToTasks 透传 otherBlocks：完成态镜像落到改绑后的新子任务", () => {
    const task = makeTask("t1", "做视频", [makeSubtask("s1", "写脚本")]);
    const sibling = makeBlock("b1", "写脚本", "t1", "s1", true);

    const result = syncBlockSaveToTasks(
      [task],
      { taskId: "t1", subtaskId: "s1", blockName: "改稿", done: true },
      [sibling]
    );

    const created = result.tasks[0].subtasks.find(
      (sub) => sub.name === "改稿"
    );
    expect(created).toBeDefined();
    expect(created?.done).toBe(true);
    expect(result.tasks[0].subtasks[0]).toMatchObject({
      id: "s1",
      name: "写脚本",
    });
    expect(result.subtaskId).toBe(created?.id);
  });
});

describe("syncBlockSaveToTasks", () => {
  it("新建时勾选已完成会同步到创建的子任务", () => {
    const task = makeTask("t1", "做视频", []);
    const result = syncBlockSaveToTasks([task], {
      taskId: "t1",
      blockName: "写脚本",
      done: true,
    });

    expect(result.subtaskId).toBeDefined();
    expect(result.tasks[0].subtasks).toHaveLength(1);
    expect(result.tasks[0].subtasks[0]).toMatchObject({
      name: "写脚本",
      done: true,
    });
  });

  it("编辑时取消勾选会把同名子任务同步回未完成", () => {
    const sub = makeSubtask("s1", "写脚本");
    sub.done = true;
    const task = makeTask("t1", "做视频", [sub]);
    const result = syncBlockSaveToTasks([task], {
      taskId: "t1",
      subtaskId: "s1",
      blockName: "写脚本",
      done: false,
    });

    expect(result.tasks[0].subtasks[0].done).toBe(false);
    expect(result.subtaskId).toBe("s1");
  });

  it("未关联任务时按名称匹配同步完成状态", () => {
    const task = makeTask("t1", "做视频", [
      makeSubtask("s1", "写脚本"),
    ]);
    const result = syncBlockSaveToTasks([task], {
      blockName: "写脚本",
      done: true,
    });

    expect(result.tasks[0].subtasks[0].done).toBe(true);
    expect(result.subtaskId).toBe("s1");
  });

  it("找不到匹配子任务时任务保持不变", () => {
    const task = makeTask("t1", "做视频", []);
    const result = syncBlockSaveToTasks([task], {
      blockName: "剪辑素材",
      done: true,
    });

    expect(result.tasks).toEqual([task]);
    expect(result.subtaskId).toBeUndefined();
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
  it("删除已完成且唯一引用某子任务的时间块时移除该子任务，任务保留", () => {
    const task = makeTask("t1", "做视频", [
      makeSubtask("s1", "写脚本"),
      makeSubtask("s2", "剪辑素材"),
    ]);
    const blocks = [
      makeBlock("b1", "写脚本", "t1", "s1", true),
      makeBlock("b2", "剪辑素材", "t1", "s2", true),
    ];

    const result = syncBlockDeletionToTasks(
      [task],
      [blocks[1]],
      [blocks[0]]
    );

    expect(result[0]).toMatchObject({ id: "t1", name: "做视频" });
    expect(result[0].subtasks.map((sub) => sub.id)).toEqual(["s2"]);
  });

  it("删除未完成的时间块时看板任务与子任务原样保留", () => {
    const task = makeTask("t1", "做视频", [
      makeSubtask("s1", "写脚本"),
      makeSubtask("s2", "剪辑素材"),
    ]);
    const blocks = [
      makeBlock("b1", "写脚本", "t1", "s1", false),
      makeBlock("b2", "剪辑素材", "t1", "s2", false),
    ];

    const result = syncBlockDeletionToTasks(
      [task],
      [blocks[1]],
      [blocks[0]]
    );

    expect(result).toEqual([task]);
  });

  it("同批删除已完成与未完成块时只清理已完成块对应的子任务", () => {
    const task = makeTask("t1", "做视频", [
      makeSubtask("s1", "写脚本"),
      makeSubtask("s2", "剪辑素材"),
    ]);
    const blocks = [
      makeBlock("b1", "写脚本", "t1", "s1", true),
      makeBlock("b2", "剪辑素材", "t1", "s2", false),
    ];

    const result = syncBlockDeletionToTasks([task], [], blocks);

    // 已完成的 s1 被清掉，未完成的 s2 保留，任务保留
    expect(result).toHaveLength(1);
    expect(result[0].subtasks.map((sub) => sub.id)).toEqual(["s2"]);
  });

  it("多个时间块共享同一子任务时，删除其一保留子任务", () => {
    const task = makeTask("t1", "做视频", [
      makeSubtask("s1", "写脚本"),
    ]);
    const blocks = [
      makeBlock("b1", "写脚本", "t1", "s1", true),
      makeBlock("b2", "写脚本", "t1", "s1", true),
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
    const block = makeBlock("b1", "写脚本", "t1", undefined, true);

    const result = syncBlockDeletionToTasks([task], [], [block]);

    expect(result).toEqual([task]);
  });

  it("批量删除已完成块时只清理无剩余引用的子任务", () => {
    const task = makeTask("t1", "做视频", [
      makeSubtask("s1", "写脚本"),
      makeSubtask("s2", "剪辑素材"),
    ]);
    const blocks = [
      makeBlock("b1", "写脚本", "t1", "s1", true),
      makeBlock("b2", "剪辑素材", "t1", "s2", true),
      makeBlock("b3", "剪辑素材", "t1", "s2", true),
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
    const block = makeBlock("b1", "剪辑素材", undefined, undefined, true);

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
      makeBlock("b1", "写脚本", "t1", "s1", true),
      makeBlock("b2", "读第一章", "t2", "s2", true),
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

  it("已完成子任务是任务下最后一个时整个任务一并移除", () => {
    const task = makeTask("t1", "做视频", [
      makeSubtask("s1", "写脚本"),
    ]);
    const block = makeBlock("b1", "写脚本", "t1", "s1", true);

    const result = syncBlockDeletionToTasks([task], [], [block]);

    expect(result).toEqual([]);
  });

  it("本次未发生子任务移除时已有任务不被误删", () => {
    const emptyTask = makeTask("t1", "做视频", []);
    const block = makeBlock("b1", "写脚本", "t1", "s-missing", true);

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
      makeBlock("b1", "写脚本", "t1", "s1", true),
      makeBlock("b2", "读第一章", "t2", "s2", true),
      makeBlock("b3", "读第二章", "t2", "s3", true),
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
