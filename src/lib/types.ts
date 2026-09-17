export type Category = "work" | "study" | "fitness" | "life" | "rest";
export type BlockStatus = "scheduled" | "pending";
export type ViewMode = "today" | "week" | "board" | "stats";
export type AiProviderSetting = "openai" | "deepseek" | "local";
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
  /** 用户自备 API Key（随 AppData 云同步，RLS 隔离；随请求传给后端调用） */
  openaiApiKey?: string;
  deepseekApiKey?: string;
  hiddenBoardWeeks?: string[];
  timelineCollapsedRanges?: Array<{ start: number; end: number }>;
  planningWeights?: PlanningWeights;
  planningStyle?: PlanningStyleId;
  timePreference?: TimePreference;
  planningFocus?: PlanningDimensionKey[];
  /** DDL 窗口（天）：截止日晚于今天+N 天的子任务暂缓排期；undefined=不限制 */
  deadlineWindowDays?: number;
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
  /** 服务端折叠编排（/parse 内联匹配）回填的任务 ID；省略时前端自行匹配 */
  taskId?: string | null;
  /** 完成指令（「标记为已完成」等）：解析产出即已完成的块；后端省略时视为 false */
  done?: boolean;
}

export interface WeekStat {
  category: Category;
  minutes: number;
  doneMinutes: number;
  count: number;
}
