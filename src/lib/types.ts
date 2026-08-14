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

export interface AppSettings {
  obsidianVault?: string;
  aiProvider?: AiProviderSetting;
  hiddenBoardWeeks?: string[];
  timelineCollapsedRanges?: Array<{ start: number; end: number }>;
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
}

export interface WeekStat {
  category: Category;
  minutes: number;
  doneMinutes: number;
  count: number;
}
