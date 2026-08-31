import type { TimePreference } from "./types";

export const DEFAULT_TIME_PREFERENCE: TimePreference = "balanced";

export interface TimePreferencePreset {
  id: TimePreference;
  label: string;
  description: string;
}

export const TIME_PREFERENCE_PRESETS: TimePreferencePreset[] = [
  {
    id: "balanced",
    label: "均衡",
    description: "默认节奏：上午最佳，深夜与凌晨降分",
  },
  {
    id: "early_bird",
    label: "早起型",
    description: "清晨是黄金时段，适合晨间例程与深度工作，晚间尽早收工",
  },
  {
    id: "night_owl",
    label: "夜猫型",
    description: "晚上与夜间效率更高，上午低分",
  },
];

export function normalizeTimePreference(value: unknown): TimePreference {
  return TIME_PREFERENCE_PRESETS.some((preset) => preset.id === value)
    ? (value as TimePreference)
    : DEFAULT_TIME_PREFERENCE;
}
