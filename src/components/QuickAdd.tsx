"use client";

import { useState } from "react";
import { CheckCircle2, Sparkles } from "lucide-react";
import type { ParsedSchedule } from "@/lib/types";
import { parseScheduleWithFeedback } from "@/lib/nlp";
import { logInfo, logWarn } from "@/lib/logger";

interface Props {
  onAddParsed: (parsed: ParsedSchedule[]) => void;
}

export default function QuickAdd({ onAddParsed }: Props) {
  const [text, setText] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [feedbackTone, setFeedbackTone] = useState<"ok" | "warn">("ok");

  const showFeedback = (message: string, tone: "ok" | "warn" = "ok") => {
    setFeedback(message);
    setFeedbackTone(tone);
    window.setTimeout(() => setFeedback(null), 3000);
  };

  const handleGenerate = () => {
    const input = text.trim();
    const { schedules, rejected } = parseScheduleWithFeedback(input);
    if (schedules.length === 0) {
      logWarn("nlp_rejected", {
        code: rejected?.code,
        inputLength: input.length,
        preview: input.slice(0, 80),
      });
      showFeedback(
        rejected?.message ?? "没有识别到时间安排，试试包含时间和事项的句子",
        "warn"
      );
      return;
    }
    onAddParsed(schedules);
    setText("");
    logInfo("nlp_generated", { count: schedules.length });
    showFeedback(`已生成 ${schedules.length} 个时间块`);
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
            className="btn-primary-pill"
          >
            <Sparkles size={14} />
            生成
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
    </div>
  );
}
