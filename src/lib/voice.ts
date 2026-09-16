/**
 * 语音输入的纯逻辑层：录音格式探测、音频转 WAV、识别文本合并。
 *
 * 为什么统一转成 16kHz 单声道 WAV 再上传，而不是直接上传浏览器录到的格式：
 *   - 硅基流动官方文档没有列出支持的音频格式，而浏览器录出的格式随平台不同
 *     （Chrome/Edge 是 webm/opus，Safari 含 iOS 是 mp4/aac），直传能否成功无法预知；
 *   - 浏览器自己的 AudioContext 一定能解码自己录出来的音频，解码后重采样就没有格式问题；
 *   - 16kHz 单声道正是 ASR 模型期望的输入，60 秒约 1.9MB，远低于 Vercel 请求体上限；
 *   - 免去后端转码依赖（Vercel Serverless 上装带 FFmpeg 二进制的 PyAV 风险大）。
 * 代价是多一次内存内解码/重采样，对秒级短音频可忽略。
 */

/** 浏览器探测到的候选录音格式，按偏好排序（webm/opus 体积小、浏览器支持最广）。 */
export const RECORDER_MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
] as const;

/** 上传目标采样率：ASR 模型期望值，且能显著压缩体积。 */
export const TARGET_SAMPLE_RATE = 16000;

/** 传给后端的文件名，扩展名与实际内容一致（16kHz 单声道 WAV）。 */
export const UPLOAD_FILENAME = "voice.wav";

export const UPLOAD_CONTENT_TYPE = "audio/wav";

/**
 * 选一个 MediaRecorder 支持的录音格式。
 * 不依赖浏览器默认值——MDN 明确说明 MediaRecorder 默认格式由实现决定，
 * 必须用 isTypeSupported 运行时探测。全不支持时返回 undefined 走浏览器默认。
 */
export function pickRecorderMime(
  isSupported: (mime: string) => boolean
): string | undefined {
  return RECORDER_MIME_CANDIDATES.find((mime) => isSupported(mime));
}

/** 多声道下混为单声道（取各声道平均）。空输入返回空数组。 */
export function downmixToMono(channels: Float32Array[]): Float32Array {
  const first = channels[0];
  if (!first) return new Float32Array(0);
  if (channels.length === 1) return first;
  const mono = new Float32Array(first.length);
  for (let i = 0; i < first.length; i += 1) {
    let sum = 0;
    for (const channel of channels) sum += channel[i] ?? 0;
    mono[i] = sum / channels.length;
  }
  return mono;
}

/** Float32 [-1,1] 采样转 16-bit PCM 小端字节。 */
function floatTo16BitPcm(samples: Float32Array): Uint8Array {
  const buffer = new ArrayBuffer(samples.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i] ?? 0));
    // 负半轴满量程是 32768，正半轴是 32767
    view.setInt16(i * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
  }
  return new Uint8Array(buffer);
}

/** 写 44 字节标准 WAV 头（RIFF/WAVE/fmt /data）。 */
function writeWavHeader(dataBytes: number, sampleRate: number): Uint8Array {
  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  const writeText = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) {
      view.setUint8(offset + i, text.charCodeAt(i));
    }
  };
  const channels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;

  writeText(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeText(8, "WAVE");
  writeText(12, "fmt ");
  view.setUint32(16, 16, true); // fmt 块长度
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeText(36, "data");
  view.setUint32(40, dataBytes, true);
  return new Uint8Array(header);
}

/** 单声道浮点采样编码为完整 WAV 字节流。 */
export function encodeWavMono(samples: Float32Array, sampleRate: number): Uint8Array {
  const pcm = floatTo16BitPcm(samples);
  const wav = new Uint8Array(44 + pcm.length);
  wav.set(writeWavHeader(pcm.length, sampleRate), 0);
  wav.set(pcm, 44);
  return wav;
}

/** 由解码后的多声道音频产出 16kHz 单声道 WAV 字节流。 */
export function encodeWavFromChannels(
  channels: Float32Array[],
  sampleRate: number
): Uint8Array {
  return encodeWavMono(downmixToMono(channels), sampleRate);
}

/**
 * 把识别文本并入输入框现有内容：追加而非覆盖，便于连续说几段再手动修改。
 * 已有内容以空格分隔（中英文都成立），空文本直接返回原文。
 */
export function mergeTranscript(existing: string, transcript: string): string {
  const addition = transcript.trim();
  if (!addition) return existing;
  const base = existing.replace(/\s+$/, "");
  return base ? `${base} ${addition}` : addition;
}

/** 录音计时显示：秒数 → m:ss。 */
export function formatElapsed(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/** 录音时长是否超出上限。 */
export function isTooLong(seconds: number, maxSeconds: number): boolean {
  return seconds > maxSeconds;
}

/** getUserMedia 抛出的错误 → 面向用户的中文提示。 */
export function describeMicError(error: unknown): string {
  const name = error instanceof Error ? error.name : "";
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return "麦克风权限被拒绝，请在浏览器地址栏允许麦克风后重试";
    case "NotFoundError":
    case "OverconstrainedError":
      return "没有检测到可用的麦克风设备";
    case "NotReadableError":
      return "麦克风被其他程序占用，请关闭后重试";
    case "AbortError":
      return "麦克风启动被中断，请重试";
    default:
      return "无法访问麦克风，请检查浏览器权限设置";
  }
}
