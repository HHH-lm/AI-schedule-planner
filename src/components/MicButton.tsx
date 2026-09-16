"use client";

import { Loader2, Mic, MicOff } from "lucide-react";
import { useVoiceInput } from "@/hooks/useVoiceInput";
import { formatElapsed, mergeTranscript } from "@/lib/voice";

interface Props {
  /** 输入框当前文本，识别结果追加在其后 */
  value: string;
  /** 回填合并后的文本 */
  onChange: (next: string) => void;
  /** 失败提示（复用各视图既有 feedback 展示） */
  onError: (message: string) => void;
  /** 录音时长上限（秒） */
  maxSeconds?: number;
  /** 输入框正在解析/拆解时禁用，避免与提交竞态 */
  disabled?: boolean;
}

/**
 * 语音输入按钮：点一下开始录音，再点一下结束并上传识别，文本追加到输入框。
 * 三态——空闲（灰麦克风）、录音中（红色麦克风 + 计时）、识别中（转圈）。
 */
export default function MicButton({
  value,
  onChange,
  onError,
  maxSeconds = 60,
  disabled = false,
}: Props) {
  const { state, elapsedSeconds, supported, toggle } = useVoiceInput({
    onTranscript: (text) => onChange(mergeTranscript(value, text)),
    onError,
    maxSeconds,
  });

  const recording = state === "recording";
  const transcribing = state === "transcribing";
  const requesting = state === "requesting";
  const busy = transcribing || requesting;

  if (!supported) {
    return (
      <button
        type="button"
        disabled
        className="icon-btn-plain !h-7 !w-7"
        title="当前浏览器不支持录音，请使用 Chrome、Edge 或 Safari"
        aria-label="当前浏览器不支持语音输入"
      >
        <MicOff size={15} />
      </button>
    );
  }

  const label = recording
    ? `结束录音（已录 ${formatElapsed(elapsedSeconds)}）`
    : transcribing
      ? "正在识别语音"
      : requesting
        ? "正在启动麦克风"
        : "语音输入";

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={disabled || busy}
      className={`icon-btn-plain !h-7 !w-7 ${recording ? "mic-btn-recording" : ""}`}
      title={recording ? `${label}，最长 ${maxSeconds} 秒` : label}
      aria-label={label}
      aria-pressed={recording}
    >
      {busy ? <Loader2 size={15} className="animate-spin" /> : <Mic size={15} />}
      {recording && (
        <span className="mic-elapsed" aria-hidden="true">
          {formatElapsed(elapsedSeconds)}
        </span>
      )}
    </button>
  );
}
