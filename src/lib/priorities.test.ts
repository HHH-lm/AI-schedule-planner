import { describe, expect, it } from "vitest";
import {
  DEFAULT_TASK_PRIORITY,
  normalizeQuadrant,
  QUADRANT_META,
  QUADRANT_ORDER,
} from "./priorities";

describe("任务四象限", () => {
  it("象限顺序固定为紧急重要、重要、紧急、其他", () => {
    expect(QUADRANT_ORDER).toEqual([
      "urgent-important",
      "important",
      "urgent",
      "neither",
    ]);
  });

  it("每个象限都有展示元数据", () => {
    for (const key of QUADRANT_ORDER) {
      expect(QUADRANT_META[key].label).toBeTruthy();
      expect(QUADRANT_META[key].dot).toBeTruthy();
    }
  });

  it("非法或缺失值统一归为既不紧急也不重要", () => {
    expect(normalizeQuadrant("unknown")).toBe("neither");
    expect(normalizeQuadrant(undefined)).toBe("neither");
    expect(normalizeQuadrant(null)).toBe("neither");
  });

  it("合法值原样返回", () => {
    expect(normalizeQuadrant("urgent-important")).toBe("urgent-important");
    expect(normalizeQuadrant("important")).toBe("important");
    expect(normalizeQuadrant("urgent")).toBe("urgent");
    expect(normalizeQuadrant("neither")).toBe("neither");
  });

  it("新建任务默认归为重要但不紧急", () => {
    expect(DEFAULT_TASK_PRIORITY).toBe("important");
  });
});
