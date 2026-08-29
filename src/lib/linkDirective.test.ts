import { describe, expect, it } from "vitest";
import {
  extractLinkDirectiveTarget,
  extractLinkDirectives,
  resolveLinkTargetLocal,
} from "./linkDirective";

describe("extractLinkDirectiveTarget", () => {
  it("识别「关联 X」基础形式", () => {
    expect(extractLinkDirectiveTarget("关联 AI schedule")).toBe("AI schedule");
    expect(extractLinkDirectiveTarget("关联AI日程")).toBe("AI日程");
  });

  it("识别「关联到/关联任务/关联项目/关联：X」变体", () => {
    expect(extractLinkDirectiveTarget("关联到 AI schedule")).toBe(
      "AI schedule"
    );
    expect(extractLinkDirectiveTarget("关联任务：AI schedule")).toBe(
      "AI schedule"
    );
    expect(extractLinkDirectiveTarget("关联项目AI schedule")).toBe(
      "AI schedule"
    );
  });

  it("识别「挂到 X 下」变体", () => {
    expect(extractLinkDirectiveTarget("挂到 AI schedule 下")).toBe(
      "AI schedule"
    );
  });

  it("非指令段返回 null", () => {
    expect(extractLinkDirectiveTarget("做关联分析")).toBeNull();
    expect(extractLinkDirectiveTarget("读书")).toBeNull();
    expect(extractLinkDirectiveTarget("关联")).toBeNull();
    expect(extractLinkDirectiveTarget("关联。。。")).toBeNull();
  });
});

describe("extractLinkDirectives", () => {
  it("尾部指令（AI 同时段合并形态）：剔除并提取目标", () => {
    expect(extractLinkDirectives("截止日期修改 + 关联 AI schedule")).toEqual({
      cleanedName: "截止日期修改",
      targets: ["AI schedule"],
    });
  });

  it("首部指令：剔除并提取目标", () => {
    expect(extractLinkDirectives("关联 AI schedule + 截止日期修改")).toEqual({
      cleanedName: "截止日期修改",
      targets: ["AI schedule"],
    });
  });

  it("中部指令：剩余段拼回", () => {
    expect(extractLinkDirectives("写代码 + 关联 X + 健身")).toEqual({
      cleanedName: "写代码 + 健身",
      targets: ["X"],
    });
  });

  it("逗号分隔的指令子句同样识别", () => {
    expect(extractLinkDirectives("截止日期修改，关联 AI schedule")).toEqual({
      cleanedName: "截止日期修改",
      targets: ["AI schedule"],
    });
  });

  it("无指令名字原样保留", () => {
    expect(extractLinkDirectives("写代码 + 健身")).toEqual({
      cleanedName: "写代码 + 健身",
      targets: [],
    });
  });

  it("含 + 号的事项名不被误拆", () => {
    expect(extractLinkDirectives("C++ 学习 + 关联 AI schedule")).toEqual({
      cleanedName: "C++ 学习",
      targets: ["AI schedule"],
    });
  });

  it("整名都是指令时不剔除（无法构成有效块名）", () => {
    expect(extractLinkDirectives("关联 AI schedule")).toEqual({
      cleanedName: "关联 AI schedule",
      targets: [],
    });
  });

  it("「关联分析」类事项名提取目标但守卫由解析决定", () => {
    expect(extractLinkDirectives("关联分析")).toEqual({
      cleanedName: "关联分析",
      targets: [],
    });
    expect(extractLinkDirectives("数据分析，关联分析")).toEqual({
      cleanedName: "数据分析",
      targets: ["分析"],
    });
  });
});

describe("resolveLinkTargetLocal", () => {
  const tasks = [
    { id: "t1", name: "AI schedule" },
    { id: "t2", name: "数据分析" },
    { id: "t3", name: "健身计划" },
  ];

  it("归一化精确匹配", () => {
    expect(resolveLinkTargetLocal("ai schedule", tasks)).toBe("t1");
    expect(resolveLinkTargetLocal("AI Schedule", tasks)).toBe("t1");
    expect(resolveLinkTargetLocal("数据分析", tasks)).toBe("t2");
  });

  it("目标带修饰词时按包含匹配", () => {
    expect(resolveLinkTargetLocal("AI schedule 项目", tasks)).toBe("t1");
    expect(resolveLinkTargetLocal("关联任务AI schedule", tasks)).toBe("t1");
  });

  it("短目标不做反向包含，避免误绑定", () => {
    expect(resolveLinkTargetLocal("分析", tasks)).toBeNull();
  });

  it("解析不到返回 null", () => {
    expect(resolveLinkTargetLocal("不存在的任务", tasks)).toBeNull();
    expect(resolveLinkTargetLocal("。。.", tasks)).toBeNull();
  });
});
