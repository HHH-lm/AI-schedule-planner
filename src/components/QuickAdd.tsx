"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, Sparkles } from "lucide-react";
import type { AiProviderSetting, ParsedSchedule } from "@/lib/types";
import { todayKey } from "@/lib/date";
import { extractDeadline } from "@/lib/deadline";
import { apiPost, API_TIMEOUT_MS } from "@/lib/api";
import { logInfo, logWarn } from "@/lib/logger";
import MicButton from "@/components/MicButton";

export type DeadlineApplyStatus = "applied" | "pending-task" | "none";

export interface AddParsedResult {
  added: number;
  deadlineStatus: DeadlineApplyStatus;
  /** 经「关联 X」指令显式绑定到的任务名（用于摘要反馈） */
  linkedTaskNames?: string[];
}

interface Props {
  onAddParsed: (
    parsed: ParsedSchedule[],
    deadline?: string,
    preflight?: { accepted?: ParsedSchedule[]; blocked?: ParsedSchedule[] }
  ) => Promise<AddParsedResult>;
  /** AI 请求字段（provider + 用户自备 Key），由 page.tsx 用 aiRequestFields 组装 */
  aiRequest?: { provider: AiProviderSetting; api_key?: string };
  /** /parse 折叠编排上下文：任务候选与已有块，page.tsx 随数据实时传入 */
  taskCandidates?: { id: string; name: string }[];
  existingBlocks?: {
    date: string;
    start: number;
    end: number;
    status: "scheduled" | "pending";
  }[];
}

interface ParseApiResponse {
  source: "openai" | "deepseek" | "local" | "none";
  schedules: ParsedSchedule[];
  rejected?: { code: string; message: string } | null;
  message?: string;
  /** 折叠编排结果：请求带 tasks/existing_blocks 时由后端返回 */
  accepted?: ParsedSchedule[];
  blocked?: ParsedSchedule[];
}

export default function QuickAdd({
  onAddParsed,
  aiRequest,
  taskCandidates,
  existingBlocks,
}: Props) {
  const [text, setText] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [feedbackTone, setFeedbackTone] = useState<"ok" | "warn">("ok");
  const [busy, setBusy] = useState(false);
  // 是否走 AI 服务商解析（provider 为 AI 且用户 Key 已配置）；本地规则无网络等待，不显示「AI」与超时提示
  const usesAi = Boolean(aiRequest?.api_key && aiRequest.provider !== "local");

  const showFeedback = (message: string, tone: "ok" | "warn" = "ok") => {
    setFeedback(message);
    setFeedbackTone(tone);
    if (tone === "ok") {
      window.setTimeout(() => setFeedback(null), 3000);
    }
  };

  const handleGenerate = async () => {
    const input = text.trim();
    if (!input || busy) return;
    setBusy(true);
    const startedAt = performance.now();

    try {
      const result = await apiPost<ParseApiResponse>("/parse", {
        text: input,
        ...(aiRequest ?? { provider: "local" }),
        today: todayKey(),
        ...(taskCandidates?.length ? { tasks: taskCandidates } : {}),
        ...(existingBlocks?.length ? { existing_blocks: existingBlocks } : {}),
      });
      const parseMs = Math.round(performance.now() - startedAt);
      if (result.source === "none") {
        logWarn("ai_parse_failed", {
          message: result.message,
          inputLength: input.length,
        });
        showFeedback(result.message ?? "AI 解析失败，请稍后重试", "warn");
        return;
      }
      if (result.schedules.length === 0) {
        logWarn("nlp_rejected", {
          code: result.rejected?.code,
          inputLength: input.length,
          preview: input.slice(0, 80),
        });
        showFeedback(
          result.rejected?.message ?? "没有识别到时间安排，试试包含时间和事项的句子",
          "warn"
        );
        return;
      }
      const deadline = extractDeadline(input) ?? undefined;
      const applyResult = await onAddParsed(result.schedules, deadline, {
        accepted: result.accepted,
        blocked: result.blocked,
      });
      const added = applyResult.added;
      const skipped = result.schedules.length - added;
      const totalMs = Math.round(performance.now() - startedAt);
      logInfo("nlp_generated", {
        count: added,
        skipped,
        source: result.source,
        deadlineExtracted: deadline ?? undefined,
        deadlineStatus: applyResult.deadlineStatus,
        parseMs,
        totalMs,
      });
      const elapsedText = `${(totalMs / 1000).toFixed(1)}s`;
      const summary =
        added > 0
          ? skipped > 0
            ? `已生成 ${added} 个时间块，跳过 ${skipped} 个冲突 · ${elapsedText}`
            : `已生成 ${added} 个时间块 · ${elapsedText}`
          : `所有时间块都与现有安排冲突，已跳过 · ${elapsedText}`;
      if (added === 0) {
        showFeedback(summary, "warn");
        return;
      }
      let summaryWithDeadline = summary;
      let tone: "ok" | "warn" = "ok";
      if (applyResult.deadlineStatus === "applied") {
        summaryWithDeadline = `${summary}，截止日期已填入关联任务`;
      } else if (applyResult.deadlineStatus === "pending-task") {
        summaryWithDeadline = `${summary}；未匹配到任务，请先选择任务以保存截止日期`;
        tone = "warn";
      }
      const linkedTaskNames = applyResult.linkedTaskNames ?? [];
      if (linkedTaskNames.length > 0) {
        summaryWithDeadline = `${summaryWithDeadline}，已关联任务 ${[
          ...new Set(linkedTaskNames),
        ].join("、")}`;
      }
      const providerLabel =
        result.source === "local" ? "本地规则" : result.source.toUpperCase();
      showFeedback(
        result.message
          ? `${result.message}，${summaryWithDeadline}`
          : `${summaryWithDeadline}（${providerLabel}）`,
        tone
      );
    } catch (error) {
      logWarn("ai_parse_failed", {
        message: error instanceof Error ? error.message : "后端服务调用失败",
        inputLength: input.length,
      });
      showFeedback(
        error instanceof Error ? error.message : "后端服务调用失败，请稍后重试",
        "warn"
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="tool-panel">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Sparkles size={18} className="shrink-0 text-primary" />
          <input
            className="input-rect"
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") handleGenerate();
            }}
            placeholder="自然语言生成：周二下午2点到5点写代码，地点深圳湾；周三上午10点健身"
          />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <MicButton
            value={text}
            onChange={setText}
            onError={(message) => showFeedback(message, "warn")}
            disabled={busy}
          />
          <button
            type="button"
            onClick={handleGenerate}
            disabled={busy}
            className="btn-primary-pill btn-sm"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            {busy ? "解析中" : "生成"}
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={`${
            feedbackTone === "ok" ? "status-note-ok" : "status-note-amber"
          } mt-3 inline-flex items-center gap-1.5 !py-1.5 text-xs`}
        >
          <CheckCircle2 size={13} />
          {feedback}
        </div>
      )}

      {busy && (
        <div className="status-note-ok mt-3 inline-flex items-center gap-1.5 !py-1.5 text-xs">
          <Loader2 size={13} className="animate-spin" />
          {usesAi
            ? `AI 解析中，最长约 ${API_TIMEOUT_MS / 1000} 秒，请稍候`
            : "解析中"}
        </div>
      )}
    </div>
  );
}
