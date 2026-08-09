"use client";

import { useState } from "react";
import { CheckCircle2, Sparkles } from "lucide-react";
import type { ParsedSchedule } from "@/lib/types";
import { parseScheduleText } from "@/lib/nlp";

interface Props {
  onAddParsed: (parsed: ParsedSchedule[]) => void;
}

export default function QuickAdd({ onAddParsed }: Props) {
  const [text, setText] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);

  const showFeedback = (message: string) => {
    setFeedback(message);
    window.setTimeout(() => setFeedback(null), 3000);
  };

  const handleGenerate = () => {
    const parsed = parseScheduleText(text);
    if (parsed.length === 0) {
      showFeedback("没有识别到时间安排，试试包含时间和事项的句子");
      return;
    }
    onAddParsed(parsed);
    setText("");
    showFeedback(`已生成 ${parsed.length} 个时间块`);
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="flex flex-1 items-center gap-2">
          <Sparkles size={18} className="shrink-0 text-blue-600" />
          <input
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") handleGenerate();
            }}
            placeholder="自然语言生成：周二下午2点到5点写代码，地点深圳湾；周三上午10点健身"
          />
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={handleGenerate}
            className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Sparkles size={14} />
            生成
          </button>
        </div>
      </div>

      {feedback && (
        <div className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-2.5 py-1 text-xs text-emerald-700">
          <CheckCircle2 size={13} />
          {feedback}
        </div>
      )}
    </div>
  );
}
