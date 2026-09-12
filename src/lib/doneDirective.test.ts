import { describe, expect, it } from "vitest";

import { extractDoneDirective } from "./doneDirective";

describe("extractDoneDirective", () => {
  it("识别独立指令段并剥离（后端同时段合并的 + 连接名）", () => {
    expect(extractDoneDirective("开会 + 标记为已完成")).toEqual({
      done: true,
      cleanedName: "开会",
    });
    expect(extractDoneDirective("标记为已完成 + 开会")).toEqual({
      done: true,
      cleanedName: "开会",
    });
  });

  it("识别中文分句符连接的指令段", () => {
    expect(extractDoneDirective("开会，标记为已完成")).toEqual({
      done: true,
      cleanedName: "开会",
    });
  });

  it("识别无分隔符的段尾后缀并剥离", () => {
    expect(extractDoneDirective("开会标记为已完成")).toEqual({
      done: true,
      cleanedName: "开会",
    });
    expect(extractDoneDirective("写代码已完成")).toEqual({
      done: true,
      cleanedName: "写代码",
    });
  });

  it("识别完成体表述（已/已经/完成了/做完了）", () => {
    expect(extractDoneDirective("写代码 + 已完成").done).toBe(true);
    expect(extractDoneDirective("写代码，已经完成").done).toBe(true);
    expect(extractDoneDirective("写代码完成了").done).toBe(true);
    expect(extractDoneDirective("写代码做完了").done).toBe(true);
  });

  it("保留其余段内容并按后端合并规则重连", () => {
    expect(extractDoneDirective("跑步 + 健身 + 已完成")).toEqual({
      done: true,
      cleanedName: "跑步 + 健身",
    });
  });

  it("无指令时原样返回且 done 为 false", () => {
    expect(extractDoneDirective("开会")).toEqual({ done: false, cleanedName: "开会" });
    expect(extractDoneDirective("跑步 + 健身")).toEqual({
      done: false,
      cleanedName: "跑步 + 健身",
    });
  });

  it("裸「完成」与截止表述不构成指令", () => {
    expect(extractDoneDirective("完成报告").done).toBe(false);
    expect(extractDoneDirective("下午3点前完成").done).toBe(false);
    expect(extractDoneDirective("写完周报").done).toBe(false);
  });

  it("「已完成」作定语的真实名称不误伤", () => {
    expect(extractDoneDirective("开已完成项目的复盘会")).toEqual({
      done: false,
      cleanedName: "开已完成项目的复盘会",
    });
  });

  it("整名都是指令时无法安全剥离，保持原名", () => {
    expect(extractDoneDirective("标记为已完成")).toEqual({
      done: false,
      cleanedName: "标记为已完成",
    });
  });
});
