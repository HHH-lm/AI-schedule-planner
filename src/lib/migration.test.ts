import { describe, expect, it } from "vitest";
import { APP_DATA_SCHEMA_VERSION, migrateAppData } from "./migration";
import { DEFAULT_PLANNING_WEIGHTS } from "./planningWeights";

describe("migrateAppData", () => {
  it("v1 存量包升级到当前版本号", () => {
    expect(
      migrateAppData({ version: 1, tasks: [], timeBlocks: [] })
    ).toEqual({
      version: APP_DATA_SCHEMA_VERSION,
      tasks: [],
      timeBlocks: [],
    });
  });

  it("无版本号按 v1 处理并升级", () => {
    expect(migrateAppData({ tasks: [], timeBlocks: [] })?.version).toBe(
      APP_DATA_SCHEMA_VERSION
    );
  });

  it("v1 旧七维权重剥离 deadline 键并归一到总和 1", () => {
    const migrated = migrateAppData({
      version: 1,
      tasks: [],
      timeBlocks: [],
      settings: {
        planningWeights: {
          memory: 0.3,
          understanding: 0.2,
          time: 0.2,
          priority: 0.2,
          conflict: 0.05,
          workload: 0.05,
          deadline: 0.5,
        },
      },
    });
    expect(migrated?.settings?.planningWeights).toEqual({
      memory: 0.3,
      understanding: 0.2,
      time: 0.2,
      priority: 0.2,
      conflict: 0.05,
      workload: 0.05,
    });
  });

  it("v1 缺失维度回退默认权重", () => {
    const { workload, ...rest } = DEFAULT_PLANNING_WEIGHTS;
    const migrated = migrateAppData({
      version: 1,
      tasks: [],
      timeBlocks: [],
      settings: { planningWeights: rest },
    });
    expect(migrated?.settings?.planningWeights).toEqual(
      DEFAULT_PLANNING_WEIGHTS
    );
  });

  it("非法 planningStyle 值被移除", () => {
    const migrated = migrateAppData({
      version: 1,
      tasks: [],
      timeBlocks: [],
      settings: { planningStyle: "not-a-style" },
    });
    expect(migrated?.settings).not.toHaveProperty("planningStyle");
  });

  it("合法的截止优先风格保留", () => {
    const migrated = migrateAppData({
      version: 1,
      tasks: [],
      timeBlocks: [],
      settings: { planningStyle: "deadline" },
    });
    expect(migrated?.settings?.planningStyle).toBe("deadline");
  });

  it("存量 aiProvider=auto 归一为 local，其余设置原样保留", () => {
    const migrated = migrateAppData({
      version: 1,
      tasks: [],
      timeBlocks: [],
      settings: {
        aiProvider: "auto",
        deepseekApiKey: "sk-test",
        obsidianVault: "obsidian://vault",
      },
    });
    expect(migrated?.settings?.aiProvider).toBe("local");
    expect(migrated?.settings?.deepseekApiKey).toBe("sk-test");
    expect(migrated?.settings?.obsidianVault).toBe("obsidian://vault");
  });

  it("非整数或字符串版本号按存量 v1 处理", () => {
    for (const version of [1.5, "1", true]) {
      const migrated = migrateAppData({
        version,
        tasks: [],
        timeBlocks: [],
        settings: { planningStyle: "not-a-style" },
      });
      expect(migrated?.version).toBe(APP_DATA_SCHEMA_VERSION);
      expect(migrated?.settings).not.toHaveProperty("planningStyle");
    }
  });

  it("结构不合法返回 null", () => {
    expect(migrateAppData(null)).toBeNull();
    expect(migrateAppData("junk")).toBeNull();
    expect(migrateAppData({ version: 1 })).toBeNull();
    expect(migrateAppData({ tasks: "no", timeBlocks: [] })).toBeNull();
  });

  it("当前版本数据原样返回", () => {
    const data = {
      version: APP_DATA_SCHEMA_VERSION,
      tasks: [],
      timeBlocks: [],
      settings: { planningStyle: "not-a-style" },
    };
    expect(migrateAppData(data)).toEqual(data);
  });

  it("高于当前版本的数据原样返回（向前兼容）", () => {
    const data = { version: APP_DATA_SCHEMA_VERSION + 1, tasks: [], timeBlocks: [] };
    expect(migrateAppData(data)).toEqual(data);
  });
});
