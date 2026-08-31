import { describe, expect, it } from "vitest";
import {
  DEFAULT_TIME_PREFERENCE,
  TIME_PREFERENCE_PRESETS,
  normalizeTimePreference,
} from "./timePreference";

describe("时段偏好预设", () => {
  it("默认为均衡档", () => {
    expect(DEFAULT_TIME_PREFERENCE).toBe("balanced");
  });

  it("包含均衡/早起型/夜猫型三档", () => {
    expect(TIME_PREFERENCE_PRESETS.map((preset) => preset.id)).toEqual([
      "balanced",
      "early_bird",
      "night_owl",
    ]);
  });

  it("normalizeTimePreference 对非法值回退均衡", () => {
    expect(normalizeTimePreference("early_bird")).toBe("early_bird");
    expect(normalizeTimePreference("night_owl")).toBe("night_owl");
    expect(normalizeTimePreference("balanced")).toBe("balanced");
    expect(normalizeTimePreference(undefined)).toBe("balanced");
    expect(normalizeTimePreference("")).toBe("balanced");
    expect(normalizeTimePreference("unknown")).toBe("balanced");
  });

  it("三档标签与描述非空", () => {
    for (const preset of TIME_PREFERENCE_PRESETS) {
      expect(preset.label.length).toBeGreaterThan(0);
      expect(preset.description.length).toBeGreaterThan(0);
    }
  });
});
