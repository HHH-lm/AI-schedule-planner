import { describe, expect, it } from "vitest";
import { planningFeedback } from "./planningFeedback";

describe("planningFeedback", () => {
  it("同时展示新增、暂缓、未找到时段和回退原因", () => {
    const message = planningFeedback({
      added: 2, blockedCount: 1, deferredCount: 3,
      message: "AI 理解超时，已使用本地调度引擎",
    });
    expect(message).toContain("新增 2 个时间块");
    expect(message).toContain("3 个子任务截止较远");
    expect(message).toContain("1 个子任务未找到合适时段");
    expect(message).toContain("AI 理解超时");
  });

  it("全部暂缓时不误报冲突或要求重试", () => {
    const message = planningFeedback({ added: 0, blockedCount: 0, deferredCount: 2 });
    expect(message).toBe("2 个子任务截止较远，暂未安排");
    expect(message).not.toMatch(/冲突|未找到|重试|其余任务|再次点击/);
  });

  it("无待排任务时保留原始提示", () => {
    expect(planningFeedback({ added: 0, blockedCount: 0, deferredCount: 0,
      message: "没有需要规划的子任务" })).toBe("没有需要规划的子任务");
  });

  it("未提供详细结果时提示调整任务", () => {
    expect(planningFeedback({ added: 0, blockedCount: 0, deferredCount: 0 }))
      .toContain("请调整任务");
  });
});
