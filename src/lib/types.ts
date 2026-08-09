export type Category = "work" | "study" | "fitness" | "life" | "rest";
export type BlockStatus = "scheduled" | "pending";
export type ViewMode = "week" | "board" | "stats";

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
  pinned?: boolean;
}

export interface TimeBlock {
  id: string;
  taskId?: string;
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
}

export interface AppSettings {
  obsidianVault?: string;
}

export interface AppData {
  version: number;
  tasks: Task[];
  timeBlocks: TimeBlock[];
  settings?: AppSettings;
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
