"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiPostForm } from "@/lib/api";
import { logWarn } from "@/lib/logger";
import {
  TARGET_SAMPLE_RATE,
  UPLOAD_CONTENT_TYPE,
  UPLOAD_FILENAME,
  describeMicError,
  downmixToMono,
  encodeWavMono,
  isTooLong,
  pickRecorderMime,
} from "@/lib/voice";

export type VoiceState = "idle" | "requesting" | "recording" | "transcribing";

interface TranscribeApiResponse {
  source: "siliconflow" | "none";
  text: string;
  message?: string | null;
}

interface Options {
  /** 识别成功后回调（已 trim）；文本并入输入框由调用方决定 */
  onTranscript: (text: string) => void;
  /** 失败提示回调，与各视图既有 feedback 样式复用 */
  onError: (message: string) => void;
  /** 录音时长上限（秒），达到后自动停止 */
  maxSeconds?: number;
}

interface VoiceController {
  state: VoiceState;
  elapsedSeconds: number;
  /** 浏览器是否具备录音能力（SSR 首帧为 false，挂载后修正） */
  supported: boolean;
  toggle: () => void;
}

type AudioContextCtor = new (options?: AudioContextOptions) => AudioContext;

/** 取 AudioContext 构造器，兼容旧 Safari 的 webkit 前缀。 */
function getAudioContextCtor(): AudioContextCtor | null {
  if (typeof window === "undefined") return null;
  const candidate =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
  return candidate ?? null;
}

/**
 * 把录到的音频解码并重采样为 16kHz 单声道 WAV。
 *
 * decodeAudioData 会把音频重采样到 AudioContext 的采样率，因此以 16kHz 建
 * AudioContext 即可一次拿到目标采样率；若浏览器忽略该选项（旧 Safari），
 * 再用 OfflineAudioContext 显式重采样兜底。
 */
async function decodeToWav(blob: Blob): Promise<Uint8Array> {
  const Ctor = getAudioContextCtor();
  if (!Ctor) throw new Error("AudioContext unavailable");

  const arrayBuffer = await blob.arrayBuffer();
  const context = new Ctor({ sampleRate: TARGET_SAMPLE_RATE });
  let decoded: AudioBuffer;
  try {
    decoded = await context.decodeAudioData(arrayBuffer);
  } finally {
    void context.close().catch(() => undefined);
  }

  const channels: Float32Array[] = [];
  for (let i = 0; i < decoded.numberOfChannels; i += 1) {
    channels.push(decoded.getChannelData(i));
  }
  const mono = downmixToMono(channels);
  if (decoded.sampleRate === TARGET_SAMPLE_RATE) {
    return encodeWavMono(mono, TARGET_SAMPLE_RATE);
  }
  return encodeWavMono(await resampleMono(mono, decoded.sampleRate), TARGET_SAMPLE_RATE);
}

/** 用 OfflineAudioContext 把单声道采样重采样到目标采样率。 */
async function resampleMono(
  samples: Float32Array,
  sourceRate: number
): Promise<Float32Array> {
  const Ctor = getAudioContextCtor();
  if (!Ctor) return samples;
  const frames = Math.max(1, Math.ceil((samples.length * TARGET_SAMPLE_RATE) / sourceRate));
  const offline = new OfflineAudioContext(1, frames, TARGET_SAMPLE_RATE);
  const buffer = offline.createBuffer(1, Math.max(1, samples.length), sourceRate);
  // copyToChannel 要求 Float32Array<ArrayBuffer>；AudioBuffer.getChannelData 的返回类型
  // 是 ArrayBufferLike，因此复制一份再写入
  buffer.copyToChannel(new Float32Array(samples), 0);
  const source = offline.createBufferSource();
  source.buffer = buffer;
  source.connect(offline.destination);
  source.start();
  const rendered = await offline.startRendering();
  return rendered.getChannelData(0);
}

/** 录音产物：解码成功走 WAV，失败则退回原始格式直传（后端只做粗筛，由上游判定）。 */
async function buildUpload(blob: Blob, mimeType: string): Promise<{ data: Uint8Array; name: string; type: string }> {
  try {
    return {
      data: await decodeToWav(blob),
      name: UPLOAD_FILENAME,
      type: UPLOAD_CONTENT_TYPE,
    };
  } catch {
    const extension = mimeType.includes("mp4")
      ? "m4a"
      : mimeType.includes("ogg")
        ? "ogg"
        : "webm";
    return {
      data: new Uint8Array(await blob.arrayBuffer()),
      name: `voice.${extension}`,
      type: mimeType || "application/octet-stream",
    };
  }
}

/**
 * 语音输入状态机：点击开始录音 → 再点结束并上传识别 → 回调文本。
 * 组件卸载时无条件停掉录音与音轨，避免麦克风指示灯常亮。
 */
export function useVoiceInput({
  onTranscript,
  onError,
  maxSeconds = 60,
}: Options): VoiceController {
  const [state, setState] = useState<VoiceState>("idle");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [supported, setSupported] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);
  const stateRef = useRef<VoiceState>("idle");
  const callbacksRef = useRef({ onTranscript, onError, maxSeconds });

  useEffect(() => {
    callbacksRef.current = { onTranscript, onError, maxSeconds };
  }, [onTranscript, onError, maxSeconds]);

  useEffect(() => {
    setSupported(
      typeof navigator !== "undefined" &&
        Boolean(navigator.mediaDevices?.getUserMedia) &&
        typeof MediaRecorder !== "undefined"
    );
  }, []);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const setStateSafe = useCallback((next: VoiceState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const upload = useCallback(
    async (blob: Blob, mimeType: string) => {
      setStateSafe("transcribing");
      try {
        const encoded = await buildUpload(blob, mimeType);
        const form = new FormData();
        form.append(
          "file",
          new Blob([encoded.data as BlobPart], { type: encoded.type }),
          encoded.name
        );
        const result = await apiPostForm<TranscribeApiResponse>("/transcribe", form);
        if (result.source === "none" || !result.text.trim()) {
          const message = result.message ?? "没有识别到语音内容，请靠近麦克风再说一次";
          logWarn("voice_transcribe_failed", { message });
          callbacksRef.current.onError(message);
          return;
        }
        callbacksRef.current.onTranscript(result.text.trim());
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "语音识别失败，请稍后重试";
        logWarn("voice_transcribe_failed", { message });
        callbacksRef.current.onError(message);
      } finally {
        setElapsedSeconds(0);
        setStateSafe("idle");
      }
    },
    [setStateSafe]
  );

  const stop = useCallback(() => {
    clearTimer();
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      // onstop 里负责上传；此处不改 state，避免上传前闪回 idle
      recorder.stop();
    } else {
      releaseStream();
      setStateSafe("idle");
    }
  }, [clearTimer, releaseStream, setStateSafe]);

  const start = useCallback(async () => {
    if (stateRef.current !== "idle") return;
    setStateSafe("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const mimeType = pickRecorderMime((mime) => MediaRecorder.isTypeSupported(mime));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const actualType = recorder.mimeType || mimeType || "";
        const blob = new Blob(chunksRef.current, { type: actualType });
        chunksRef.current = [];
        recorderRef.current = null;
        releaseStream();
        void upload(blob, actualType);
      };
      recorder.start();

      startedAtRef.current = Date.now();
      setElapsedSeconds(0);
      setStateSafe("recording");
      clearTimer();
      timerRef.current = window.setInterval(() => {
        const seconds = (Date.now() - startedAtRef.current) / 1000;
        setElapsedSeconds(Math.floor(seconds));
        if (isTooLong(seconds, callbacksRef.current.maxSeconds)) stop();
      }, 200);
    } catch (error) {
      releaseStream();
      setStateSafe("idle");
      const message = describeMicError(error);
      logWarn("voice_mic_failed", { message });
      callbacksRef.current.onError(message);
    }
  }, [clearTimer, releaseStream, setStateSafe, stop, upload]);

  const toggle = useCallback(() => {
    if (stateRef.current === "recording") stop();
    else if (stateRef.current === "idle") void start();
  }, [start, stop]);

  useEffect(
    () => () => {
      clearTimer();
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        recorder.ondataavailable = null;
        recorder.onstop = null;
        recorder.stop();
      }
      releaseStream();
    },
    [clearTimer, releaseStream]
  );

  return { state, elapsedSeconds, supported, toggle };
}
