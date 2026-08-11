import type { TaskQuadrant } from "./types";

export interface QuadrantMeta {
  key: TaskQuadrant;
  label: string;
  description: string;
  dot: string;
  bg: string;
  border: string;
  text: string;
}

export const QUADRANT_ORDER: TaskQuadrant[] = [
  "urgent-important",
  "important",
  "urgent",
  "neither",
];

export const QUADRANT_META: Record<TaskQuadrant, QuadrantMeta> = {
  "urgent-important": {
    key: "urgent-important",
    label: "紧急且重要",
    description: "马上做",
    dot: "bg-[#c0392b]",
    bg: "bg-[rgba(192,57,43,0.07)]",
    border: "border-l-[#c0392b]",
    text: "text-[#a93226]",
  },
  important: {
    key: "important",
    label: "重要但不紧急",
    description: "计划做",
    dot: "bg-[#0066cc]",
    bg: "bg-[rgba(0,102,204,0.07)]",
    border: "border-l-[#0066cc]",
    text: "text-primary",
  },
  urgent: {
    key: "urgent",
    label: "紧急但不重要",
    description: "快速处理",
    dot: "bg-[#d49a2a]",
    bg: "bg-[rgba(212,154,42,0.08)]",
    border: "border-l-[#d49a2a]",
    text: "text-[#9a6b00]",
  },
  neither: {
    key: "neither",
    label: "既不紧急也不重要",
    description: "延后或减少",
    dot: "bg-[#8e8e93]",
    bg: "bg-[rgba(142,142,147,0.08)]",
    border: "border-l-[#8e8e93]",
    text: "text-ink-muted-48",
  },
};

export const DEFAULT_TASK_PRIORITY: TaskQuadrant = "important";

export function normalizeQuadrant(value: unknown): TaskQuadrant {
  return value === "urgent-important" ||
    value === "important" ||
    value === "urgent" ||
    value === "neither"
    ? value
    : "neither";
}
