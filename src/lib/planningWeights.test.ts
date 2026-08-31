import { describe, expect, it } from "vitest";
import {
  DEFAULT_PLANNING_WEIGHTS,
  PLANNING_WEIGHT_DIMENSIONS,
  PLANNING_STYLE_PRESETS,
  clampWeight,
  applyPlanningFocus,
  describePlanningWeights,
  getPlanningStyle,
  inferPlanningSelection,
  normalizePlanningWeights,
  normalizeWeightsToSum,
} from "./planningWeights";

describe("个性化规划权重", () => {
  it("默认值与 SchedulingEngine 六维加权评分一致", () => {
    expect(DEFAULT_PLANNING_WEIGHTS).toEqual({
      memory: 0.33,
      understanding: 0.22,
      time: 0.17,
      priority: 0.17,
      conflict: 0.06,
      workload: 0.05,
    });
  });

  it("默认权重之和为 1", () => {
    const sum = Object.values(DEFAULT_PLANNING_WEIGHTS).reduce(
      (acc, value) => acc + value,
      0
    );
    expect(sum).toBeCloseTo(1, 10);
  });

  it("六个维度都有中文标签", () => {
    expect(PLANNING_WEIGHT_DIMENSIONS.map((d) => d.label)).toEqual([
      "记忆",
      "理解",
      "时间",
      "优先级",
      "冲突",
      "负荷",
    ]);
  });

  it("缺失或空值回退到默认值", () => {
    expect(normalizePlanningWeights()).toEqual(DEFAULT_PLANNING_WEIGHTS);
    expect(normalizePlanningWeights(null)).toEqual(DEFAULT_PLANNING_WEIGHTS);
  });

  it("旧版七维数据中的 deadline 键会被剥离（localStorage 无缝迁移）", () => {
    const legacy = {
      ...DEFAULT_PLANNING_WEIGHTS,
      deadline: 0.1,
    } as unknown as Parameters<typeof normalizePlanningWeights>[0];
    const weights = normalizePlanningWeights(legacy);
    expect(Object.keys(weights)).not.toContain("deadline");
    expect(weights).toEqual(DEFAULT_PLANNING_WEIGHTS);
  });

  it("部分输入按默认比例补齐并归一到 100%", () => {
    const weights = normalizePlanningWeights({ memory: 0.5 });
    const percents = Object.values(weights).map((v) => Math.round(v * 100));
    expect(percents.reduce((a, b) => a + b, 0)).toBe(100);
    expect(weights.memory).toBeGreaterThan(0.3);
  });

  it("数值范围钳制在 0-1", () => {
    expect(clampWeight(-0.2)).toBe(0);
    expect(clampWeight(1.5)).toBe(1);
    expect(clampWeight(0.3)).toBe(0.3);
    expect(clampWeight(Number.NaN)).toBe(0);
    const weights = normalizePlanningWeights({ memory: 2, understanding: -1 });
    const percents = Object.values(weights).map((v) => Math.round(v * 100));
    expect(weights.memory).toBeLessThanOrEqual(1);
    expect(weights.understanding).toBe(0);
    expect(percents.reduce((a, b) => a + b, 0)).toBe(100);
  });

  it("归一化后权重之和为 1 且为整数百分比", () => {
    const weights = normalizeWeightsToSum({
      memory: 0.35,
      understanding: 0.25,
      time: 0.15,
      priority: 0.15,
      conflict: 0.1,
      workload: 0.1,
    });
    const percents = Object.values(weights).map((v) => Math.round(v * 100));
    expect(percents.every((v) => Number.isInteger(v))).toBe(true);
    expect(percents.reduce((a, b) => a + b, 0)).toBe(100);
  });

  it("normalizePlanningWeights 对非 1 总和输入做归一化", () => {
    const weights = normalizePlanningWeights({
      memory: 0.35,
      understanding: 0.25,
      time: 0.15,
      priority: 0.15,
      conflict: 0.1,
      workload: 0.1,
    });
    const percents = Object.values(weights).map((v) => Math.round(v * 100));
    expect(percents.reduce((a, b) => a + b, 0)).toBe(100);
  });

  it("每个规划风格预设都是合法的整数百分比", () => {
    expect(PLANNING_STYLE_PRESETS.map((preset) => preset.id)).toEqual([
      "balanced",
      "focus",
      "deadline",
      "stability",
      "workload",
    ]);

    for (const preset of PLANNING_STYLE_PRESETS) {
      const percents = Object.values(preset.weights).map((value) =>
        Math.round(value * 100)
      );
      expect(percents.reduce((sum, value) => sum + value, 0)).toBe(100);
    }
  });

  it("不存在的风格 ID 回退到均衡推荐", () => {
    const style = getPlanningStyle("unknown" as unknown as Parameters<
      typeof getPlanningStyle
    >[0]);
    expect(style.id).toBe("balanced");
  });

  it("单个重点维度固定占 35%，其余按所选风格比例分配", () => {
    const weights = applyPlanningFocus("balanced", ["memory"]);
    const percents = Object.values(weights).map((value) =>
      Math.round(value * 100)
    );

    expect(Math.round(weights.memory * 100)).toBe(35);
    expect(percents.reduce((sum, value) => sum + value, 0)).toBe(100);
    expect(weights.understanding).toBeGreaterThan(weights.time);
    expect(weights.time).toBeGreaterThan(weights.workload);
  });

  it("两个重点维度各占 25%，重复计算结果保持稳定", () => {
    const first = applyPlanningFocus("workload", ["priority", "time"]);
    const second = applyPlanningFocus("workload", ["priority", "time"]);
    const percents = Object.values(first).map((value) =>
      Math.round(value * 100)
    );

    expect(Math.round(first.priority * 100)).toBe(25);
    expect(Math.round(first.time * 100)).toBe(25);
    expect(percents.reduce((sum, value) => sum + value, 0)).toBe(100);
    expect(first).toEqual(second);
  });

  it("能识别预设、重点组合和存量自定义权重", () => {
    expect(inferPlanningSelection(DEFAULT_PLANNING_WEIGHTS)).toEqual({
      styleId: "balanced",
      focus: [],
    });
    expect(
      inferPlanningSelection(applyPlanningFocus("balanced", ["time"]))
    ).toEqual({
      styleId: "balanced",
      focus: ["time"],
    });
    expect(
      inferPlanningSelection({
        memory: 0.24,
        understanding: 0.2,
        time: 0.18,
        priority: 0.16,
        conflict: 0.12,
        workload: 0.1,
      })
    ).toEqual({ styleId: "custom", focus: [] });
  });

  it("用中文摘要解释当前最重视的维度", () => {
    const summary = describePlanningWeights(
      applyPlanningFocus("balanced", ["memory"])
    );

    expect(summary).toContain("记忆");
    expect(summary).toContain("理解");
  });
});
