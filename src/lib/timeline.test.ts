import { describe, expect, it } from "vitest";
import { getTimelineFocusScroll } from "./timeline";

const BASE = {
  columnWidth: 132,
  clientWidth: 980,
  clientHeight: 600,
  scrollHeight: 1152,
  start: 14 * 60,
  end: 16 * 60,
  timeColumnWidth: 56,
  hourHeight: 48,
};

describe("getTimelineFocusScroll", () => {
  it("内容宽度等于视口时不产生横向滚动", () => {
    const position = getTimelineFocusScroll({ ...BASE, dayIndex: 3 });
    expect(position.left).toBe(0);
  });

  it("窄视口下把右侧列滚入可视区域", () => {
    const position = getTimelineFocusScroll({
      ...BASE,
      dayIndex: 6,
      clientWidth: 700,
    });
    expect(position.left).toBe(980 - 700);
  });

  it("把下午时间块垂直居中到视口", () => {
    const position = getTimelineFocusScroll({ ...BASE, dayIndex: 1 });
    expect(position.top).toBe(672 + 48 - 300);
  });

  it("凌晨块靠近顶部时钳制到 0", () => {
    const position = getTimelineFocusScroll({
      ...BASE,
      dayIndex: 0,
      start: 0,
      end: 60,
    });
    expect(position.top).toBe(0);
  });
});
