export type Category = "work" | "study" | "fitness" | "life" | "rest";
export type BlockStatus = "scheduled" | "pending";
export type ViewMode = "today" | "week" | "board" | "stats";
export type AiProviderSetting = "auto" | "openai" | "deepseek" | "local";
export type TaskQuadrant = "urgent-important" | "important" | "urgent" | "neither";
export type MemoryCategory =
  | "time-preference"
  | "habit"
  | "life-preference"
  | "long-term-constraint";
export type MemorySource = "manual" | "ai-suggested";

export interface Subtask {
  id: string;
  name: string;
  done: boolean;
  /** 截止日期 YYYY-MM-DD，选填；规划与展示均以子任务为粒度 */
  deadline?: string;
}

export interface Task {
  id: string;
  name: string;
  date: string | null;
  status: "todo" | "done";
  subtasks: Subtask[];
  priority?: TaskQuadrant;
  pinned?: boolean;
}

export interface TimeBlock {
  id: string;
  taskId?: string;
  subtaskId?: string;
  name: string;
  date: string;
  start: number;
  end: number;
  category: Category;
  location?: string;
  done: boolean;
  status: BlockStatus;
  obsidianVault?: string;
  obsidianNote?: string;
  remindAt?: string;
}

export interface Memory {
  id: string;
  category: MemoryCategory;
  content: string;
  createdAt: string;
  updatedAt: string;
  source: MemorySource;
  status?: "active" | "archived";
}

export interface AIMemorySuggestion {
  id: string;
  category: MemoryCategory;
  content: string;
  conclusion?: string;
  reasoning: string;
  confidence: number;
  createdAt: string;
  status: "pending";
}

export interface PlanningWeights {
  memory: number;
  understanding: number;
  time: number;
  priority: number;
  conflict: number;
  workload: number;
}

export type PlanningDimensionKey = keyof PlanningWeights;

export type PlanningStyleId =
  | "balanced"
  | "focus"
  | "deadline"
  | "stability"
  | "workload"
  | "custom";

export type TimePreference = "balanced" | "early_bird" | "night_owl";

export interface AppSettings {
  obsidianVault?: string;
  aiProvider?: AiProviderSetting;
  hiddenBoardWeeks?: string[];
  timelineCollapsedRanges?: Array<{ start: number; end: number }>;
  planningWeights?: PlanningWeights;
  planningStyle?: PlanningStyleId;
  timePreference?: TimePreference;
  planningFocus?: PlanningDimensionKey[];
}

export interface AppData {
  version: number;
  tasks: Task[];
  timeBlocks: TimeBlock[];
  settings?: AppSettings;
  memories?: Memory[];
  aiMemorySuggestions?: AIMemorySuggestion[];
}

export interface ParsedSchedule {
  name: string;
  date: string;
  start: number;
  end: number;
  category: Category;
  location?: string;
  linkTask?: string | null;
}

export interface WeekStat {
  category: Category;
  minutes: number;
  doneMinutes: number;
  count: number;
}
