import type {
  PlanningDimensionKey,
  PlanningStyleId,
  PlanningWeights,
} from "./types";

export const DEFAULT_PLANNING_WEIGHTS: PlanningWeights = {
  memory: 0.3,
  understanding: 0.2,
  time: 0.15,
  priority: 0.15,
  deadline: 0.1,
  conflict: 0.05,
  workload: 0.05,
};

export const PLANNING_WEIGHT_DIMENSIONS: Array<{
  key: PlanningDimensionKey;
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

export interface PlanningStyle {
  id: PlanningStyleId;
  label: string;
  description: string;
  weights: PlanningWeights;
}

export const PLANNING_STYLE_PRESETS: Array<PlanningStyle> = [
  {
    id: "balanced",
    label: "均衡推荐",
    description: "兼顾记忆、理解与日常节奏",
    weights: DEFAULT_PLANNING_WEIGHTS,
  },
  {
    id: "deadline",
    label: "截止优先",
    description: "优先保护临近截止的任务",
    weights: {
      memory: 0.05,
      understanding: 0.1,
      time: 0.15,
      priority: 0.2,
      deadline: 0.35,
      conflict: 0.1,
      workload: 0.05,
    },
  },
  {
    id: "focus",
    label: "深度专注",
    description: "给理解和记忆更高优先级",
    weights: {
      memory: 0.25,
      understanding: 0.3,
      time: 0.15,
      priority: 0.1,
      deadline: 0.1,
      conflict: 0.05,
      workload: 0.05,
    },
  },
  {
    id: "stability",
    label: "稳妥安排",
    description: "尽量减少冲突和日程挤压",
    weights: {
      memory: 0.1,
      understanding: 0.15,
      time: 0.2,
      priority: 0.05,
      deadline: 0.15,
      conflict: 0.3,
      workload: 0.05,
    },
  },
  {
    id: "workload",
    label: "负荷可控",
    description: "避免把一天排得过于饱和",
    weights: {
      memory: 0.18,
      understanding: 0.17,
      time: 0.15,
      priority: 0.1,
      deadline: 0.07,
      conflict: 0.05,
      workload: 0.28,
    },
  },
];

const FOCUS_WEIGHT_FOR_ONE = 35;
const FOCUS_WEIGHT_FOR_TWO = 25;

function allocatePercentages(total: number, ratios: number[]): number[] {
  if (ratios.length === 0) return [];
  const ratioTotal = ratios.reduce((sum, value) => sum + Math.max(0, value), 0);
  if (ratioTotal <= 0) {
    const base = Math.floor(total / ratios.length);
    let remaining = total - base * ratios.length;
    return ratios.map(() => {
      const extra = remaining > 0 ? 1 : 0;
      remaining -= extra;
      return base + extra;
    });
  }

  const exact = ratios.map((value) =>
    (Math.max(0, value) / ratioTotal) * total
  );
  const result = exact.map(Math.floor);
  let allocated = result.reduce((sum, value) => sum + value, 0);
  const remainderOrder = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);

  for (const { index } of remainderOrder) {
    if (allocated >= total) break;
    result[index] += 1;
    allocated += 1;
  }
  return result;
}

function percentsMatch(
  left: PlanningWeights,
  right: PlanningWeights
): boolean {
  return PLANNING_WEIGHT_DIMENSIONS.every(
    (dimension) =>
      Math.round(left[dimension.key] * 100) ===
      Math.round(right[dimension.key] * 100)
  );
}

export function getPlanningStyle(id?: PlanningStyleId | null): PlanningStyle {
  return (
    PLANNING_STYLE_PRESETS.find((preset) => preset.id === id) ??
    PLANNING_STYLE_PRESETS[0]
  );
}

export function applyPlanningFocus(
  styleId: PlanningStyleId,
  focus: PlanningDimensionKey[]
): PlanningWeights {
  if (styleId === "custom") return normalizePlanningWeights(DEFAULT_PLANNING_WEIGHTS);

  const selected = PLANNING_WEIGHT_DIMENSIONS.filter((dimension) =>
    focus.includes(dimension.key)
  ).slice(0, 2);
  const base = getPlanningStyle(styleId).weights;
  if (selected.length === 0) return normalizePlanningWeights(base);

  const basePercents = Object.fromEntries(
    PLANNING_WEIGHT_DIMENSIONS.map((dimension) => [
      dimension.key,
      Math.round(base[dimension.key] * 100),
    ])
  ) as Record<PlanningDimensionKey, number>;
  const next = { ...basePercents };
  const unselected = PLANNING_WEIGHT_DIMENSIONS.filter(
    (dimension) => !selected.includes(dimension)
  );
  const focusTotal =
    selected.length === 1 ? FOCUS_WEIGHT_FOR_ONE : FOCUS_WEIGHT_FOR_TWO * selected.length;
  const remaining = 100 - focusTotal;
  const allocatedUnselected = allocatePercentages(
    remaining,
    unselected.map((dimension) => basePercents[dimension.key])
  );
  unselected.forEach((dimension, index) => {
    next[dimension.key] = allocatedUnselected[index];
  });
  const focusShare = selected.length === 1
    ? FOCUS_WEIGHT_FOR_ONE
    : FOCUS_WEIGHT_FOR_TWO;
  selected.forEach((dimension) => {
    next[dimension.key] = focusShare;
  });

  const result = { ...base };
  for (const dimension of PLANNING_WEIGHT_DIMENSIONS) {
    result[dimension.key] = clampWeight(next[dimension.key] / 100);
  }
  return result;
}

export function inferPlanningSelection(weights: PlanningWeights): {
  styleId: PlanningStyleId;
  focus: PlanningDimensionKey[];
} {
  const dimensionKeys = PLANNING_WEIGHT_DIMENSIONS.map(
    (dimension) => dimension.key
  );

  for (const preset of PLANNING_STYLE_PRESETS) {
    if (percentsMatch(weights, preset.weights)) {
      return { styleId: preset.id, focus: [] };
    }
  }

  for (const first of dimensionKeys) {
    for (const preset of PLANNING_STYLE_PRESETS) {
      if (percentsMatch(weights, applyPlanningFocus(preset.id, [first]))) {
        return { styleId: preset.id, focus: [first] };
      }
    }
  }

  for (let firstIndex = 0; firstIndex < dimensionKeys.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < dimensionKeys.length; secondIndex += 1) {
      const focus = [dimensionKeys[firstIndex], dimensionKeys[secondIndex]];
      for (const preset of PLANNING_STYLE_PRESETS) {
        if (percentsMatch(weights, applyPlanningFocus(preset.id, focus))) {
          return { styleId: preset.id, focus };
        }
      }
    }
  }

  return { styleId: "custom", focus: [] };
}

export function describePlanningWeights(weights: PlanningWeights): string {
  const positive = PLANNING_WEIGHT_DIMENSIONS.filter(
    (dimension) => Math.round(weights[dimension.key] * 100) > 0
  ).sort(
    (a, b) =>
      weights[b.key] - weights[a.key] ||
      PLANNING_WEIGHT_DIMENSIONS.findIndex(
        (item) => item.key === a.key
      ) -
        PLANNING_WEIGHT_DIMENSIONS.findIndex((item) => item.key === b.key)
  );
  const labels = positive.slice(0, 2).map((dimension) => dimension.label);
  if (labels.length === 0) return "当前还没有可参与评分的权重。";
  return `当前会最重视${labels.join("和")}。`;
}

export function clampWeight(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/**
 * 把权重转成整数百分比并归一到总和 100。
 * 保持各维度比例，最后把舍入误差补到占比最大的维度。
 */
export function normalizeWeightsToSum(
  weights: PlanningWeights
): PlanningWeights {
  const percents = PLANNING_WEIGHT_DIMENSIONS.map((d) =>
    Math.round(clampWeight(weights[d.key]) * 100)
  );
  const total = percents.reduce((a, b) => a + b, 0);
  if (total <= 0) return { ...DEFAULT_PLANNING_WEIGHTS };
  const result = { ...weights };
  let allocated = 0;
  PLANNING_WEIGHT_DIMENSIONS.forEach((d, index) => {
    const share =
      index === PLANNING_WEIGHT_DIMENSIONS.length - 1
        ? 100 - allocated
        : Math.round((percents[index] / total) * 100);
    result[d.key] = clampWeight(share / 100);
    allocated += share;
  });
  const diff = 100 - allocated;
  if (diff !== 0) {
    let largestKey = PLANNING_WEIGHT_DIMENSIONS[0].key;
    for (const d of PLANNING_WEIGHT_DIMENSIONS) {
      if (result[d.key] > result[largestKey]) largestKey = d.key;
    }
    result[largestKey] = clampWeight(
      Math.round(result[largestKey] * 100 + diff) / 100
    );
  }
  return result;
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
  return normalizeWeightsToSum(result);
}
