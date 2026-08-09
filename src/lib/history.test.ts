import { describe, expect, it } from "vitest";
import {
  canRedo,
  canUndo,
  commitHistoryState,
  createHistoryState,
  redoHistoryState,
  undoHistoryState,
} from "./history";

describe("history state", () => {
  it("提交变更后入栈并清空 future", () => {
    let state = createHistoryState(1);
    expect(canUndo(state)).toBe(false);

    state = commitHistoryState(state, 2);
    expect(state.present).toBe(2);
    expect(state.past).toEqual([1]);
    expect(canUndo(state)).toBe(true);

    state = commitHistoryState(state, 3);
    expect(state.past).toEqual([1, 2]);
    expect(state.future).toEqual([]);
  });

  it("撤销恢复上一份并生成 future", () => {
    let state = createHistoryState(1);
    state = commitHistoryState(state, 2);
    state = commitHistoryState(state, 3);

    state = undoHistoryState(state);
    expect(state.present).toBe(2);
    expect(state.past).toEqual([1]);
    expect(state.future).toEqual([3]);
  });

  it("重做恢复 future 并回填 past", () => {
    let state = createHistoryState(1);
    state = commitHistoryState(state, 2);
    state = undoHistoryState(state);

    state = redoHistoryState(state);
    expect(state.present).toBe(2);
    expect(state.past).toEqual([1]);
    expect(state.future).toEqual([]);
  });

  it("空栈撤销或重做保持不变", () => {
    const state = createHistoryState(1);
    expect(undoHistoryState(state)).toBe(state);
    expect(redoHistoryState(state)).toBe(state);
  });

  it("历史最多保留 limit 步", () => {
    let state = createHistoryState(0, 3);
    for (let i = 1; i <= 5; i++) state = commitHistoryState(state, i);
    expect(state.past).toEqual([2, 3, 4]);
    expect(state.present).toBe(5);
  });

  it("相同引用不重复入栈", () => {
    const item = { n: 1 };
    let state = createHistoryState(item);
    state = commitHistoryState(state, item);
    expect(state.past).toEqual([]);
  });
});
