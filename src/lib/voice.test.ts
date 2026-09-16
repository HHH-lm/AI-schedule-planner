import { describe, expect, it } from "vitest";
import {
  RECORDER_MIME_CANDIDATES,
  TARGET_SAMPLE_RATE,
  describeMicError,
  downmixToMono,
  encodeWavFromChannels,
  encodeWavMono,
  formatElapsed,
  isTooLong,
  mergeTranscript,
  pickRecorderMime,
} from "./voice";

describe("pickRecorderMime", () => {
  it("按偏好顺序取第一个被支持的格式", () => {
    const supported = new Set(["audio/webm", "audio/mp4"]);
    expect(pickRecorderMime((mime) => supported.has(mime))).toBe("audio/webm");
  });

  it("首选格式被支持时优先选 webm/opus", () => {
    expect(pickRecorderMime(() => true)).toBe(RECORDER_MIME_CANDIDATES[0]);
  });

  it("只支持 mp4 时返回 mp4（Safari 场景）", () => {
    expect(pickRecorderMime((mime) => mime === "audio/mp4")).toBe("audio/mp4");
  });

  it("全不支持时返回 undefined，交由浏览器默认", () => {
    expect(pickRecorderMime(() => false)).toBeUndefined();
  });
});

describe("downmixToMono", () => {
  it("单声道原样返回", () => {
    const mono = new Float32Array([0.1, -0.2]);
    expect(downmixToMono([mono])).toBe(mono);
  });

  it("立体声取各声道平均", () => {
    const left = new Float32Array([1, 0]);
    const right = new Float32Array([0, 0.5]);
    const result = downmixToMono([left, right]);
    expect(Array.from(result)).toEqual([0.5, 0.25]);
  });

  it("空输入返回空数组", () => {
    expect(downmixToMono([]).length).toBe(0);
  });
});

describe("encodeWavMono", () => {
  it("写出 44 字节头 + 2 字节/采样，且头字段正确", () => {
    const samples = new Float32Array([0, 0.5, -0.5]);
    const wav = encodeWavMono(samples, TARGET_SAMPLE_RATE);

    expect(wav.length).toBe(44 + samples.length * 2);
    const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
    const text = (offset: number, length: number) =>
      String.fromCharCode(...wav.slice(offset, offset + length));

    expect(text(0, 4)).toBe("RIFF");
    expect(text(8, 4)).toBe("WAVE");
    expect(text(12, 4)).toBe("fmt ");
    expect(text(36, 4)).toBe("data");
    expect(view.getUint32(4, true)).toBe(36 + samples.length * 2);
    expect(view.getUint16(20, true)).toBe(1); // PCM
    expect(view.getUint16(22, true)).toBe(1); // 单声道
    expect(view.getUint32(24, true)).toBe(TARGET_SAMPLE_RATE);
    expect(view.getUint32(28, true)).toBe(TARGET_SAMPLE_RATE * 2); // byteRate
    expect(view.getUint16(32, true)).toBe(2); // blockAlign
    expect(view.getUint16(34, true)).toBe(16); // 位深
    expect(view.getUint32(40, true)).toBe(samples.length * 2);
  });

  it("采样值按小端 16 位 PCM 编码，负半轴满量程为 -32768", () => {
    const wav = encodeWavMono(new Float32Array([0, 1, -1]), TARGET_SAMPLE_RATE);
    const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
    expect(view.getInt16(44, true)).toBe(0);
    expect(view.getInt16(46, true)).toBe(32767);
    expect(view.getInt16(48, true)).toBe(-32768);
  });

  it("超出 [-1,1] 的采样被钳制，不产生溢出回绕", () => {
    const wav = encodeWavMono(new Float32Array([2, -2]), TARGET_SAMPLE_RATE);
    const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
    expect(view.getInt16(44, true)).toBe(32767);
    expect(view.getInt16(46, true)).toBe(-32768);
  });

  it("空采样只产出头部", () => {
    expect(encodeWavMono(new Float32Array(0), TARGET_SAMPLE_RATE).length).toBe(44);
  });
});

describe("encodeWavFromChannels", () => {
  it("先下混再编码：立体声两条同相轨道得到与原单声道一致的 PCM", () => {
    const left = new Float32Array([1, -1]);
    const right = new Float32Array([1, -1]);
    const wav = encodeWavFromChannels([left, right], TARGET_SAMPLE_RATE);
    const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
    expect(wav.length).toBe(44 + 4);
    expect(view.getInt16(44, true)).toBe(32767);
    expect(view.getInt16(46, true)).toBe(-32768);
  });
});

describe("mergeTranscript", () => {
  it("空输入框直接填入识别文本", () => {
    expect(mergeTranscript("", "明天下午三点开会")).toBe("明天下午三点开会");
  });

  it("已有内容时追加并以空格分隔，不覆盖", () => {
    expect(mergeTranscript("写代码", "健身")).toBe("写代码 健身");
  });

  it("识别文本前后空白被裁剪", () => {
    expect(mergeTranscript("写代码", "  健身  ")).toBe("写代码 健身");
  });

  it("识别为空或纯空白时保持原文不变", () => {
    expect(mergeTranscript("写代码", "")).toBe("写代码");
    expect(mergeTranscript("写代码", "   ")).toBe("写代码");
  });

  it("已有内容尾部空白不会产生双空格", () => {
    expect(mergeTranscript("写代码   ", "健身")).toBe("写代码 健身");
  });

  it("空输入框收到空识别结果时返回空串", () => {
    expect(mergeTranscript("", "  ")).toBe("");
  });
});

describe("formatElapsed", () => {
  it("按 m:ss 补零", () => {
    expect(formatElapsed(0)).toBe("0:00");
    expect(formatElapsed(5)).toBe("0:05");
    expect(formatElapsed(59)).toBe("0:59");
    expect(formatElapsed(60)).toBe("1:00");
    expect(formatElapsed(125)).toBe("2:05");
  });

  it("负数按 0 处理，小数向下取整", () => {
    expect(formatElapsed(-3)).toBe("0:00");
    expect(formatElapsed(9.8)).toBe("0:09");
  });
});

describe("isTooLong", () => {
  it("达到上限本身不算超限，超过才算", () => {
    expect(isTooLong(60, 60)).toBe(false);
    expect(isTooLong(60.1, 60)).toBe(true);
    expect(isTooLong(59, 60)).toBe(false);
  });
});

describe("describeMicError", () => {
  it("权限拒绝给出放行麦克风的指引", () => {
    const error = Object.assign(new Error("denied"), { name: "NotAllowedError" });
    expect(describeMicError(error)).toContain("权限被拒绝");
  });

  it("无设备与设备占用分别给出对应提示", () => {
    expect(
      describeMicError(Object.assign(new Error("x"), { name: "NotFoundError" }))
    ).toContain("没有检测到");
    expect(
      describeMicError(Object.assign(new Error("x"), { name: "NotReadableError" }))
    ).toContain("占用");
  });

  it("未知错误给出通用提示且不抛异常", () => {
    expect(describeMicError(new Error("boom"))).toContain("无法访问麦克风");
    expect(describeMicError(null)).toContain("无法访问麦克风");
    expect(describeMicError("string error")).toContain("无法访问麦克风");
  });
});
