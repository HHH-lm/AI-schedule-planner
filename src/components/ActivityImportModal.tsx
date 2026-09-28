"use client";

import { useMemo, useRef, useState } from "react";
import { FileUp, Loader2, X } from "lucide-react";
import ModalLayer from "@/components/ModalLayer";
import { CATEGORIES } from "@/lib/categories";
import { apiPost } from "@/lib/api";
import {
  extractCandidates,
  findPlanConflicts,
  formatCandidateTime,
  parseEvidenceFile,
  selectedToActivities,
  type ActivityCandidateView,
  type ActivityDigestPayload,
  type EvidenceSummary,
} from "@/lib/activityImport";
import type { Activity, Category, TimeBlock } from "@/lib/types";

interface Props {
  /** 已确认记录的 dedupKey 集合，用于识别同一天重复导入 */
  existingDedupKeys: ReadonlySet<string>;
  /** 现有计划块：勾选候选与其时间重叠时，确认前需用户决定「删除计划块并导入」 */
  timeBlocks: TimeBlock[];
  /** AI 归纳用的 provider 与用户自备 Key（未配置 AI 时后端自动回退规则归纳） */
  aiFields: { provider: string; api_key?: string };
  onConfirm: (activities: Activity[], deleteBlockIds: string[]) => void;
  onClose: () => void;
}

type Phase = "pick" | "loading" | "review" | "confirm" | "error";

/**
 * 导入今日活动（F-045）：选择本机 collect:activity 产出的证据 JSON，
 * 后端归纳为候选记录后逐条勾选/修改，确认才写入活动记录——采集自动、确认人工。
 */
export default function ActivityImportModal({
  existingDedupKeys,
  timeBlocks,
  aiFields,
  onConfirm,
  onClose,
}: Props) {
  const [phase, setPhase] = useState<Phase>("pick");
  const [summary, setSummary] = useState<EvidenceSummary | null>(null);
  const [views, setViews] = useState<ActivityCandidateView[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [digestSource, setDigestSource] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 勾选候选与计划块的时间重叠：review 阶段打标记，确认阶段列清单
  const conflicts = useMemo(
    () => findPlanConflicts(views, selected, timeBlocks),
    [views, selected, timeBlocks]
  );
  const conflictCandidates = useMemo(
    () => new Set(conflicts.map((conflict) => conflict.candidateKey)),
    [conflicts]
  );
  const conflictBlockIds = useMemo(
    () => Array.from(new Set(conflicts.map((conflict) => conflict.blockId))),
    [conflicts]
  );

  const handleFile = async (file: File) => {
    setError(null);
    setNotice(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      setError("文件不是有效的 JSON，请选择 collect:activity 产出的证据文件");
      setPhase("error");
      return;
    }
    const result = parseEvidenceFile(parsed);
    if (!result.ok) {
      setError(result.error);
      setPhase("error");
      return;
    }
    setPhase("loading");
    setSummary(result.summary);
    try {
      const payload = await apiPost<ActivityDigestPayload>(
        "/activities/digest",
        { evidence: result.evidence, use_ai: true, ...aiFields },
        45_000
      );
      const candidateViews = extractCandidates(payload, existingDedupKeys);
      if (candidateViews.length === 0) {
        setError(payload.message || "证据里没有可识别的活动");
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
      setPhase("error");
    }
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
              onClick={() => setPhase("pick")}
              className="btn-ghost w-full justify-center"
            >
              重新选择文件
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
