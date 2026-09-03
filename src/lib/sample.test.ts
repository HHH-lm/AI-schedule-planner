import { describe, expect, it } from "vitest";
import { isSampleData, makeSampleData } from "./sample";
import type { AppData, Task } from "./types";

const userTask: Task = {
  id: "user-generated-id",
  name: "用户自建任务",
  date: null,
  status: "todo",
  subtasks: [],
  priority: "neither",
};

describe("isSampleData", () => {
  it("完整示例数据识别为演示数据", () => {
    expect(isSampleData(makeSampleData())).toBe(true);
  });

  it("仅保留部分示例任务仍识别为演示数据", () => {
    const partial = makeSampleData();
    partial.tasks = partial.tasks.slice(0, 3);
    expect(isSampleData(partial)).toBe(true);
  });

  it("混入用户自建任务后不再视为演示数据", () => {
    const mixed = makeSampleData();
    mixed.tasks = [...mixed.tasks, userTask];
    expect(isSampleData(mixed)).toBe(false);
  });

  it("任务列表为空时不视为演示数据", () => {
    const empty: AppData = { version: 1, tasks: [], timeBlocks: [] };
    expect(isSampleData(empty)).toBe(false);
  });

  it("用户本地数据（随机 ID）不误判为演示数据", () => {
    const local = makeSampleData();
    local.tasks = local.tasks.map((task) => ({
      ...task,
      id: `uid-${task.id}`,
    }));
    expect(isSampleData(local)).toBe(false);
  });
});
