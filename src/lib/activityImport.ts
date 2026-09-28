import type { Activity, ActivitySource, Category, TimeBlock } from "./types";
import { uid } from "./storage";
import { splitBlockByDays } from "./blockTime";

/** 后端 /activities/digest 返回的候选（snake_case，与 PlanV2Block 同风格） */
export interface ActivityCandidateRaw {
  dedup_key: string;
  date: string;
  start?: number | null;
  end?: number | null;
  summary: string;
  category: string;
  sources: string[];
  evidence?: string | null;
}

export interface ActivityDigestPayload {
  source: string;
  used_ai: boolean;
  candidates: ActivityCandidateRaw[];
  message?: string | null;
}

/** 候选在弹窗里的视图形态：带时间文案与「已导入」标记 */
export interface ActivityCandidateView {
  dedupKey: string;
  date: string;
  start?: number;
  end?: number;
  summary: string;
  category: Category;
  sources: string[];
  evidence?: string;
  /** 同指纹记录已存在（此前确认过），默认不勾选 */
  imported: boolean;
}

export interface EvidenceSummary {
  date: string;
  zcodeSessions: number;
  gitCommits: number;
  files: number;
}

export type EvidenceParseResult =
  | { ok: true; evidence: Record<string, unknown>; summary: EvidenceSummary }
  | { ok: false; error: string };

const CATEGORIES: Category[] = ["work", "study", "fitness", "life", "rest"];

function normalizeCategory(value: unknown): Category {
  return CATEGORIES.includes(value as Category) ? (value as Category) : "work";
}

/**
 * 校验并摘录证据文件的关键结构。只读元数据字段；结构不符时给出中文原因，
 * 避免把选错的文件（周报导出、其他 JSON）原样发给后端。
 */
export function parseEvidenceFile(raw: unknown): EvidenceParseResult {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, error: "文件不是有效的证据 JSON（应为对象）" };
  }
  const record = raw as Record<string, unknown>;
  const date = record.date;
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { ok: false, error: "证据文件缺少采集日期（date）字段" };
  }
  const sources = record.sources;
  if (typeof sources !== "object" || sources === null) {
    return { ok: false, error: "证据文件缺少来源（sources）字段，请用 collect:activity 脚本产出" };
  }
  const sourceRecord = sources as Record<string, unknown>;
  const zcodeSessions = countListItems(sourceRecord.zcode, "sessions");
  const gitCommits = countGitCommits(sourceRecord.git);
  const files = countListItems(sourceRecord.files, "files");
  if (zcodeSessions + gitCommits + files === 0) {
    return { ok: false, error: `证据文件（${date}）里没有任何活动记录` };
  }
  return {
    ok: true,
    evidence: record,
    summary: { date, zcodeSessions, gitCommits, files },
  };
}

function countListItems(source: unknown, key: string): number {
  if (typeof source !== "object" || source === null) return 0;
  const items = (source as Record<string, unknown>)[key];
  return Array.isArray(items) ? items.length : 0;
}

function countGitCommits(source: unknown): number {
  if (typeof source !== "object" || source === null) return 0;
  const repos = (source as Record<string, unknown>).repos;
  if (!Array.isArray(repos)) return 0;
  return repos.reduce((sum: number, repo) => {
    if (typeof repo !== "object" || repo === null) return sum;
    const commits = (repo as Record<string, unknown>).commits;
    return sum + (Array.isArray(commits) ? commits.length : 0);
  }, 0);
}

/** 候选列表 → 弹窗视图：时间归一、类目兜底、按既有指纹标记「已导入」 */
export function extractCandidates(
  payload: ActivityDigestPayload,
  existingDedupKeys: ReadonlySet<string>
): ActivityCandidateView[] {
  const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
  return candidates
    .filter((candidate) => candidate && typeof candidate.dedup_key === "string" && candidate.dedup_key)
    .map((candidate) => ({
      dedupKey: candidate.dedup_key,
      date: candidate.date,
      start: typeof candidate.start === "number" ? candidate.start : undefined,
      end: typeof candidate.end === "number" ? candidate.end : undefined,
      summary: typeof candidate.summary === "string" ? candidate.summary : "",
      category: normalizeCategory(candidate.category),
      sources: Array.isArray(candidate.sources) ? candidate.sources.filter(isActivitySource) : [],
      evidence: typeof candidate.evidence === "string" && candidate.evidence ? candidate.evidence : undefined,
      imported: existingDedupKeys.has(candidate.dedup_key),
    }));
}

function isActivitySource(value: unknown): value is ActivitySource {
  return value === "zcode" || value === "git" || value === "files" || value === "manual";
}

export function formatCandidateTime(start?: number, end?: number): string {
  if (typeof start !== "number" || typeof end !== "number") return "";
  const format = (minutes: number) =>
    `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  return `${format(start)}–${format(end)}`;
}

/** 勾选的候选 → 落库的 Activity 记录（确认时间即此刻） */
export function selectedToActivities(
  views: ActivityCandidateView[],
  selectedKeys: ReadonlySet<string>
): Activity[] {
  const confirmedAt = new Date().toISOString();
  return views
    .filter((view) => selectedKeys.has(view.dedupKey))
    .map((view) => ({
      id: uid(),
      date: view.date,
      ...(view.start !== undefined ? { start: view.start } : {}),
      ...(view.end !== undefined ? { end: view.end } : {}),
      summary: view.summary,
      category: view.category,
      sources: view.sources as ActivitySource[],
      ...(view.evidence !== undefined ? { evidence: view.evidence } : {}),
      dedupKey: view.dedupKey,
      confirmedAt,
    }));
}

/** 候选与计划块的一次重叠：同一日期上候选时间窗压到了计划块（跨天取其当日段） */
export interface PlanConflict {
  candidateKey: string;
  blockId: string;
  blockName: string;
  date: string;
  blockStart: number;
  blockEnd: number;
}

/**
 * 找出勾选候选与现有计划块的时间重叠。
 * 待排期（pending）块不在时间轴上、无时间窗候选无锚点，均不参与；
 * 每个候选×计划块只记一次（跨天块命中任一天即记）。
 */
export function findPlanConflicts(
  views: ActivityCandidateView[],
  selectedKeys: ReadonlySet<string>,
  timeBlocks: TimeBlock[]
): PlanConflict[] {
  const conflicts: PlanConflict[] = [];
  for (const view of views) {
    if (!selectedKeys.has(view.dedupKey)) continue;
    if (view.start === undefined || view.end === undefined) continue;
    for (const block of timeBlocks) {
      if (block.status !== "scheduled") continue;
      for (const segment of splitBlockByDays(block)) {
        if (segment.dateKey !== view.date) continue;
        if (view.start < segment.end && segment.start < view.end) {
          conflicts.push({
            candidateKey: view.dedupKey,
            blockId: block.id,
            blockName: block.name,
            date: view.date,
            blockStart: segment.start,
            blockEnd: segment.end,
          });
          break;
        }
      }
    }
  }
  return conflicts;
}
