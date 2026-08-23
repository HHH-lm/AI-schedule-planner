import type { PlanningWeights } from "./types";

export const DEFAULT_PLANNING_WEIGHTS: PlanningWeights = {
  memory: 0.35,
  understanding: 0.25,
  time: 0.15,
  priority: 0.15,
  deadline: 0.1,
  conflict: 0.1,
  workload: 0.1,
};

export const PLANNING_WEIGHT_DIMENSIONS: Array<{
  key: keyof PlanningWeights;
  label: string;
}> = [
  { key: "memory", label: "记忆" },
  { key: "understanding", label: "理解" },
  { key: "time", label: "时间" },
  { key: "priority", label: "优先级" },
  { key: "deadline", label: "截止日期" },
  { key: "conflict", label: "冲突" },
  { key: "workload", label: "负荷" },
];

export function clampWeight(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function normalizePlanningWeights(
  weights?: Partial<PlanningWeights> | null
): PlanningWeights {
  const result = { ...DEFAULT_PLANNING_WEIGHTS };
  if (!weights) return result;
  for (const dimension of PLANNING_WEIGHT_DIMENSIONS) {
    const value = weights[dimension.key];
    if (typeof value === "number") {
      result[dimension.key] = clampWeight(value);
    }
  }
  return result;
}
