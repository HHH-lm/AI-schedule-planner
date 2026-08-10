"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, Sparkles } from "lucide-react";
import type { AiProviderSetting, ParsedSchedule } from "@/lib/types";
import { todayKey } from "@/lib/date";
import { apiPost, API_TIMEOUT_MS } from "@/lib/api";
import { logInfo, logWarn } from "@/lib/logger";

interface Props {
  onAddParsed: (parsed: ParsedSchedule[]) => Promise<number>;
  aiProvider?: AiProviderSetting;
}

interface ParseApiResponse {
  source: "openai" | "deepseek" | "local" | "none";
  schedules: ParsedSchedule[];
  rejected?: { code: string; message: string } | null;
  message?: string;
}

export default function QuickAdd({ onAddParsed, aiProvider }: Props) {
  const [text, setText] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [feedbackTone, setFeedbackTone] = useState<"ok" | "warn">("ok");
  const [busy, setBusy] = useState(false);

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

    try {
      const result = await apiPost<ParseApiResponse>("/parse", {
        text: input,
        provider: aiProvider ?? "auto",
        today: todayKey(),
      });
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
      const added = await onAddParsed(result.schedules);
      const skipped = result.schedules.length - added;
      logInfo("nlp_generated", {
        count: added,
        skipped,
        source: result.source,
      });
      const summary =
        added > 0
          ? skipped > 0
            ? `已生成 ${added} 个时间块，跳过 ${skipped} 个冲突`
            : `已生成 ${added} 个时间块`
          : "所有时间块都与现有安排冲突，已跳过";
      if (added === 0) {
        showFeedback(summary, "warn");
        return;
      }
      const providerLabel =
        result.source === "local" ? "本地规则" : result.source.toUpperCase();
      showFeedback(
        result.message ? `${result.message}，${summary}` : `${summary}（${providerLabel}）`
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
            className="input-pill"
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") handleGenerate();
            }}
            placeholder="自然语言生成：周二下午2点到5点写代码，地点深圳湾；周三上午10点健身"
          />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={handleGenerate}
            disabled={busy}
            className="btn-primary-pill"
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
          AI 解析中，最长约 {API_TIMEOUT_MS / 1000} 秒，请稍候
        </div>
      )}
    </div>
  );
}
