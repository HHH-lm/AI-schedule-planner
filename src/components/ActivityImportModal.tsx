"use client";

import { useMemo, useRef, useState } from "react";
import { FileUp, Loader2, Radar, X } from "lucide-react";
import ModalLayer from "@/components/ModalLayer";
import { CATEGORIES } from "@/lib/categories";
import { apiPost } from "@/lib/api";
import {
  buildCollectDayList,
  extractCandidates,
  findPlanConflicts,
  formatCandidateTime,
  parseEvidenceFile,
  selectedToActivities,
  summaryTotal,
  type ActivityCandidateView,
  type ActivityCollectItemRaw,
  type ActivityCollectPayload,
  type ActivityDigestPayload,
  type CollectDayView,
  type EvidenceSummary,
} from "@/lib/activityImport";
import type { Activity, Category, TimeBlock } from "@/lib/types";

interface Props {
  /** 已确认记录的 dedupKey 集合，用于识别同一天重复导入 */
  existingDedupKeys: ReadonlySet<string>;
  /** 已确认记录：检索结果里标注每天已导入条数 */
  activities: Activity[];
  /** 现有计划块：勾选候选与其时间重叠时，确认前需用户决定「删除计划块并导入」 */
  timeBlocks: TimeBlock[];
  /** AI 归纳用的 provider 与用户自备 Key（未配置 AI 时后端自动回退规则归纳） */
  aiFields: { provider: string; api_key?: string };
  /** 打开时的首屏：file=选证据文件（云端可用），collect=检索本机活动（仅本地后端） */
  initialMode?: "file" | "collect";
  /** 自动补采/上次检索结果；有值时 collect 模式直接显示日列表，省一次等待 */
  prefetchedItems?: ActivityCollectItemRaw[];
  /** 检索成功回调：页面据此更新待审角标与缓存 */
  onCollected?: (items: ActivityCollectItemRaw[]) => void;
  onConfirm: (activities: Activity[], deleteBlockIds: string[]) => void;
  onClose: () => void;
}

type Phase = "pick" | "collect" | "collectLoading" | "loading" | "review" | "confirm" | "error";

type CollectRange = "today" | "yesterday-today" | "last-3";

const COLLECT_RANGES: { key: CollectRange; label: string; days: number }[] = [
  { key: "today", label: "今天", days: 1 },
  { key: "yesterday-today", label: "昨天 + 今天", days: 2 },
  { key: "last-3", label: "最近 3 天", days: 3 },
];

const COLLECT_TIMEOUT_MS = 60_000;

function toDateKey(day: Date): string {
  const y = day.getFullYear();
  const m = String(day.getMonth() + 1).padStart(2, "0");
  const d = String(day.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function rangeBounds(range: CollectRange, today: Date): { from: string; to: string } {
  const days = COLLECT_RANGES.find((item) => item.key === range)?.days ?? 3;
  const start = new Date(today);
  start.setDate(start.getDate() - (days - 1));
  return { from: toDateKey(start), to: toDateKey(today) };
}

function dayLabel(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const names = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  const day = new Date(y, (m ?? 1) - 1, d ?? 1);
  return `${m}月${d}日 ${names[day.getDay()]}`;
}

/**
 * 导入活动（F-045）：选择本机 collect:activity 产出的证据 JSON，
 * 后端归纳为候选记录后逐条勾选/修改，确认才写入活动记录——采集自动、确认人工。
 * F-046 增补 collect 首屏：应用内直接检索本机活动（仅本地后端），逐日进入同一确认流程。
 */
export default function ActivityImportModal({
  existingDedupKeys,
  activities,
  timeBlocks,
  aiFields,
  initialMode = "file",
  prefetchedItems,
  onCollected,
  onConfirm,
  onClose,
}: Props) {
  const [phase, setPhase] = useState<Phase>(initialMode === "collect" ? "collect" : "pick");
  const [summary, setSummary] = useState<EvidenceSummary | null>(null);
  const [views, setViews] = useState<ActivityCandidateView[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [digestSource, setDigestSource] = useState<string | null>(null);
  const [collectRange, setCollectRange] = useState<CollectRange>("last-3");
  const [collectItems, setCollectItems] = useState<ActivityCollectItemRaw[]>(
    prefetchedItems ?? []
  );
  const [collectNote, setCollectNote] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // error 阶段返回哪一屏：文件导入回 pick，检索流程回 collect
  const [returnPhase, setReturnPhase] = useState<Phase>("pick");

  // 勾选候选与计划块的时间重叠：review 阶段打标记，确认阶段列清单
  const conflicts = useMemo(
    () => findPlanConflicts(views, selected, timeBlocks),
    [views, selected, timeBlocks]
  );
  const conflictCandidates = useMemo(
    () => new Set(conflicts.map((conflict) => conflict.candidateKey)),
    [conflicts]
  );
  const dayViews = useMemo(
    () => buildCollectDayList(collectItems, activities),
    [collectItems, activities]
  );
  const conflictBlockIds = useMemo(
    () => Array.from(new Set(conflicts.map((conflict) => conflict.blockId))),
    [conflicts]
  );

  const runDigest = async (evidence: Record<string, unknown>, evidenceSummary: EvidenceSummary) => {
    setPhase("loading");
    setSummary(evidenceSummary);
    try {
      const payload = await apiPost<ActivityDigestPayload>(
        "/activities/digest",
        { evidence, use_ai: true, ...aiFields },
        45_000
      );
      const candidateViews = extractCandidates(payload, existingDedupKeys);
      if (candidateViews.length === 0) {
        setError(payload.message || "证据里没有可识别的活动");
        setReturnPhase("collect");
        setPhase("error");
        return;
      }
      setViews(candidateViews);
      setSelected(
        new Set(candidateViews.filter((view) => !view.imported).map((view) => view.dedupKey))
      );
      setDigestSource(payload.used_ai ? payload.source : "local");
      setNotice(payload.message ?? null);
      setPhase("review");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "归纳失败，请稍后重试");
      setReturnPhase("collect");
      setPhase("error");
    }
  };

  const handleFile = async (file: File) => {
    setError(null);
    setNotice(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      setError("文件不是有效的 JSON，请选择 collect:activity 产出的证据文件");
      setReturnPhase("pick");
      setPhase("error");
      return;
    }
    const result = parseEvidenceFile(parsed);
    if (!result.ok) {
      setError(result.error);
      setReturnPhase("pick");
      setPhase("error");
      return;
    }
    await runDigest(result.evidence, result.summary);
  };

  const handleCollect = async () => {
    setError(null);
    setCollectNote(null);
    setPhase("collectLoading");
    const { from, to } = rangeBounds(collectRange, new Date());
    try {
      const payload = await apiPost<ActivityCollectPayload>(
        "/activities/collect",
        { from, to },
        COLLECT_TIMEOUT_MS
      );
      const items = Array.isArray(payload.items) ? payload.items : [];
      setCollectItems(items);
      onCollected?.(items);
      setPhase("collect");
      const okCount = items.filter((item) => item.evidence).length;
      const failed = items.filter((item) => item.error);
      if (items.length === 0) setCollectNote("没有检索到任何日期");
      else if (failed.length > 0)
        setCollectNote(`${okCount} 天检索成功，${failed.length} 天失败（见下方提示）`);
      else if (okCount === 0) setCollectNote("检索完成，但这些天没有可导入的活动痕迹");
    } catch (collectError) {
      setError(collectError instanceof Error ? collectError.message : "检索失败，请稍后重试");
      setReturnPhase("collect");
      setPhase("error");
    }
  };

  const handlePickDay = async (day: CollectDayView) => {
    if (!day.evidence) return;
    setError(null);
    setNotice(null);
    const result = parseEvidenceFile(day.evidence);
    if (!result.ok) {
      setError(result.error);
      setReturnPhase("collect");
      setPhase("error");
      return;
    }
    await runDigest(result.evidence, result.summary);
  };

  const toggle = (dedupKey: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(dedupKey)) next.delete(dedupKey);
      else next.add(dedupKey);
      return next;
    });
  };

  const updateView = (dedupKey: string, patch: Partial<ActivityCandidateView>) => {
    setViews((prev) =>
      prev.map((view) => (view.dedupKey === dedupKey ? { ...view, ...patch } : view))
    );
  };

  const handleConfirm = () => {
    if (conflicts.length > 0) {
      setPhase("confirm");
      return;
    }
    onConfirm(selectedToActivities(views, selected), []);
  };

  const handleReplacePlans = () => {
    onConfirm(selectedToActivities(views, selected), conflictBlockIds);
  };

  return (
    <ModalLayer onClose={onClose}>
      <div
        className="modal-card modal-card-scroll max-w-lg thin-scroll"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <h3 className="modal-title">导入活动记录</h3>
          <button type="button" onClick={onClose} className="icon-btn-plain" aria-label="关闭">
            <X size={16} />
          </button>
        </div>

        {phase === "pick" && (
          <div className="space-y-3 p-4">
            <p className="text-sm leading-6 text-ink-muted-80">
              选择本机 <code className="rounded bg-[#f0f0f0] px-1">npm run collect:activity</code>{" "}
              产出的证据文件（activity_evidence_日期.json），AI 会把它归纳成候选记录；
              确认前数据不会离开你的电脑。
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleFile(file);
                event.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="btn-primary-pill w-full justify-center"
            >
              <FileUp size={15} />
              选择证据 JSON 文件
            </button>
            <button
              type="button"
              onClick={() => {
                setError(null);
                setNotice(null);
                setPhase("collect");
              }}
              className="btn-ghost w-full justify-center"
            >
              <Radar size={15} />
              改为检索本机活动
            </button>
          </div>
        )}

        {phase === "collectLoading" && (
          <div className="flex items-center gap-2 p-4 text-sm text-ink-muted-80">
            <Loader2 size={15} className="animate-spin" />
            正在检索本机活动记录，首次可能要十几秒…
          </div>
        )}

        {phase === "collect" && (
          <div className="space-y-3 p-4">
            <p className="text-sm leading-6 text-ink-muted-80">
              检索本机的活动痕迹（ZCode 会话 / git 提交 / 文件变动），选一天进入确认流程；
              确认前数据不会离开你的电脑。
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {COLLECT_RANGES.map((range) => (
                <button
                  key={range.key}
                  type="button"
                  onClick={() => setCollectRange(range.key)}
                  className={
                    collectRange === range.key
                      ? "btn-primary-pill px-3 py-1 text-xs"
                      : "btn-ghost px-3 py-1 text-xs"
                  }
                >
                  {range.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => void handleCollect()}
                className="btn-primary-pill ml-auto px-3 py-1 text-xs"
              >
                <Radar size={14} />
                {dayViews.length > 0 ? "重新检索" : "开始检索"}
              </button>
            </div>
            {collectNote && (
              <p className="rounded-[8px] bg-[rgba(196,148,20,0.1)] px-3 py-2 text-xs leading-5 text-[#8a6510]">
                {collectNote}
              </p>
            )}
            {dayViews.length > 0 ? (
              <div className="max-h-80 space-y-2 overflow-y-auto thin-scroll">
                {dayViews.map((day) => {
                  const total = summaryTotal(day.summary);
                  const importable = Boolean(day.evidence);
                  return (
                    <button
                      key={day.date}
                      type="button"
                      disabled={!importable}
                      onClick={() => void handlePickDay(day)}
                      className={`flex w-full items-center justify-between gap-3 rounded-[8px] border p-3 text-left ${
                        importable
                          ? "border-[#e5e5e5] hover:border-ink-muted-48"
                          : "border-[#e5e5e5] opacity-60"
                      }`}
                    >
                      <div className="min-w-0 space-y-0.5">
                        <div className="text-sm font-medium text-ink">{dayLabel(day.date)}</div>
                        <div className="text-xs text-ink-muted-48">
                          {day.error
                            ? `采集失败：${day.error}`
                            : `ZCode ${day.summary.zcodeSessions} 段 / 提交 ${day.summary.gitCommits} 次 / 文件 ${day.summary.files} 个`}
                        </div>
                      </div>
                      <div className="shrink-0 text-right text-xs">
                        {day.importedCount > 0 && (
                          <div className="text-[#146b46]">已有 {day.importedCount} 条</div>
                        )}
                        {importable && total > 0 && <div className="text-ink-muted-80">导入 →</div>}
                        {importable && total === 0 && (
                          <div className="text-ink-muted-48">无活动痕迹</div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-ink-muted-48">
                选好范围后点「开始检索」。此功能需要本地运行的后端（npm run dev）。
              </p>
            )}
            <button type="button" onClick={onClose} className="btn-ghost w-full justify-center">
              关闭
            </button>
          </div>
        )}

        {phase === "loading" && summary && (
          <div className="flex items-center gap-2 p-4 text-sm text-ink-muted-80">
            <Loader2 size={15} className="animate-spin" />
            正在归纳 {summary.date} 的活动（ZCode {summary.zcodeSessions} 段 / 提交{" "}
            {summary.gitCommits} 次 / 文件 {summary.files} 个）…
          </div>
        )}

        {phase === "confirm" && (
          <div className="space-y-3 p-4">
            <p className="rounded-[8px] bg-[rgba(196,148,20,0.1)] px-3 py-2 text-xs leading-5 text-[#8a6510]">
              勾选的 {selected.size} 条候选中有 {conflicts.length} 处与现有计划时间重叠。
              继续导入将删除 {conflictBlockIds.length} 个计划块，由实际记录取代（⌘Z 可撤销）：
            </p>
            <div className="max-h-64 space-y-2 overflow-y-auto thin-scroll">
              {conflicts.map((conflict, index) => {
                const view = views.find((item) => item.dedupKey === conflict.candidateKey);
                return (
                  <div key={`${conflict.candidateKey}:${conflict.blockId}:${index}`} className="rounded-[8px] border border-[#e5e5e5] p-2.5 text-xs leading-5">
                    <div className="font-medium text-ink">
                      {formatCandidateTime(view?.start, view?.end) || "无时间"} {view?.summary}
                    </div>
                    <div className="text-[#b4232a]">
                      替换计划：{conflict.blockName}（{formatCandidateTime(conflict.blockStart, conflict.blockEnd)}）
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPhase("review")}
                className="btn-ghost flex-1 justify-center"
              >
                返回修改
              </button>
              <button
                type="button"
                onClick={handleReplacePlans}
                className="btn-primary-pill flex-1 justify-center"
              >
                删除 {conflictBlockIds.length} 个计划块并导入
              </button>
            </div>
          </div>
        )}

        {phase === "error" && error && (
          <div className="space-y-3 p-4">
            <p className="text-sm leading-6 text-[#b4232a]">{error}</p>
            <button
              type="button"
              onClick={() => setPhase(returnPhase)}
              className="btn-ghost w-full justify-center"
            >
              {returnPhase === "collect" ? "返回检索列表" : "重新选择文件"}
            </button>
          </div>
        )}

        {phase === "review" && summary && (
          <div className="space-y-3 p-4">
            <p className="text-sm text-ink-muted-80">
              {summary.date}：{views.length} 条候选，已选中 {selected.size} 条
              {digestSource === "local" ? "（规则归纳）" : "（AI 归纳）"}
            </p>
            {notice && (
              <p className="rounded-[8px] bg-[rgba(196,148,20,0.1)] px-3 py-2 text-xs leading-5 text-[#8a6510]">
                {notice}
              </p>
            )}
            <div className="max-h-80 space-y-2 overflow-y-auto thin-scroll">
              {views.map((view) => {
                const time = formatCandidateTime(view.start, view.end);
                return (
                  <div
                    key={view.dedupKey}
                    className={`rounded-[8px] border p-3 ${
                      view.imported ? "border-[#e5e5e5] opacity-60" : "border-[#e5e5e5]"
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        checked={selected.has(view.dedupKey)}
                        onChange={() => toggle(view.dedupKey)}
                        className="mt-1"
                        aria-label={`选择：${view.summary}`}
                      />
                      <div className="min-w-0 flex-1 space-y-2">
                        <input
                          type="text"
                          value={view.summary}
                          onChange={(event) => updateView(view.dedupKey, { summary: event.target.value })}
                          className="w-full rounded-[6px] border border-[#e5e5e5] px-2 py-1.5 text-sm text-ink"
                        />
                        <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted-48">
                          {time && <span className="font-mono">{time}</span>}
                          <select
                            value={view.category}
                            onChange={(event) =>
                              updateView(view.dedupKey, { category: event.target.value as Category })
                            }
                            className="rounded-[6px] border border-[#e5e5e5] bg-white px-1.5 py-0.5 text-xs"
                            aria-label="类目"
                          >
                            {Object.entries(CATEGORIES).map(([key, meta]) => (
                              <option key={key} value={key}>
                                {meta.label}
                              </option>
                            ))}
                          </select>
                          {view.evidence && <span className="truncate">{view.evidence}</span>}
                          {conflictCandidates.has(view.dedupKey) && (
                            <span className="text-[#8a6510]">与计划重叠</span>
                          )}
                          {view.imported && (
                            <span className="text-[#146b46]">已导入过（同指纹）</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className="btn-ghost flex-1 justify-center">
                取消
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={selected.size === 0}
                className="btn-primary-pill flex-1 justify-center"
              >
                确认导入 {selected.size} 条
              </button>
            </div>
          </div>
        )}
      </div>
    </ModalLayer>
  );
}
