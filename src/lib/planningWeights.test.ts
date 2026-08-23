import { describe, expect, it } from "vitest";
import {
  DEFAULT_PLANNING_WEIGHTS,
  PLANNING_WEIGHT_DIMENSIONS,
  clampWeight,
  normalizePlanningWeights,
} from "./planningWeights";

describe("个性化规划权重", () => {
  it("默认值与 SchedulingEngine 七维加权评分一致", () => {
    expect(DEFAULT_PLANNING_WEIGHTS).toEqual({
      memory: 0.35,
      understanding: 0.25,
      time: 0.15,
      priority: 0.15,
      deadline: 0.1,
      conflict: 0.1,
      workload: 0.1,
    });
  });

  it("七个维度都有中文标签", () => {
    expect(PLANNING_WEIGHT_DIMENSIONS.map((d) => d.label)).toEqual([
      "记忆",
      "理解",
      "时间",
      "优先级",
      "截止日期",
      "冲突",
      "负荷",
    ]);
  });

  it("缺失或非法值回退到默认值", () => {
    expect(normalizePlanningWeights()).toEqual(DEFAULT_PLANNING_WEIGHTS);
    expect(normalizePlanningWeights(null)).toEqual(DEFAULT_PLANNING_WEIGHTS);
    expect(normalizePlanningWeights({ memory: 0.5 })).toEqual({
      ...DEFAULT_PLANNING_WEIGHTS,
      memory: 0.5,
    });
  });

  it("数值范围钳制在 0-1", () => {
    expect(clampWeight(-0.2)).toBe(0);
    expect(clampWeight(1.5)).toBe(1);
    expect(clampWeight(0.3)).toBe(0.3);
    expect(clampWeight(Number.NaN)).toBe(0);
    expect(normalizePlanningWeights({ memory: 2, understanding: -1 })).toEqual({
      ...DEFAULT_PLANNING_WEIGHTS,
      memory: 1,
      understanding: 0,
    });
  });
});
