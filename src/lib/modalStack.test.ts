import { beforeEach, describe, expect, it } from "vitest";
import {
  MODAL_BASE_Z_INDEX,
  getModalStack,
  isTopModal,
  modalZIndex,
  popModal,
  pushModal,
  registerModal,
  scrollLockActive,
  subscribeModalStack,
  unregisterModal,
} from "./modalStack";

describe("pushModal / popModal", () => {
  it("pushModal 追加到栈尾且不修改原数组", () => {
    const base = ["a"];
    const next = pushModal(base, "b");
    expect(next).toEqual(["a", "b"]);
    expect(base).toEqual(["a"]);
  });

  it("popModal 按 id 移除并保持其余顺序", () => {
    expect(popModal(["a", "b", "c"], "b")).toEqual(["a", "c"]);
  });

  it("popModal 移除不存在的 id 时等价原样返回", () => {
    expect(popModal(["a", "b"], "x")).toEqual(["a", "b"]);
  });
});

describe("isTopModal（后进先出）", () => {
  it("最后入栈的是栈顶", () => {
    const stack = ["memory", "confirm"];
    expect(isTopModal(stack, "confirm")).toBe(true);
    expect(isTopModal(stack, "memory")).toBe(false);
  });

  it("空栈没有任何栈顶", () => {
    expect(isTopModal([], "a")).toBe(false);
  });
});

describe("modalZIndex（按栈深递增）", () => {
  it("底层为基础值，每上一层 +1", () => {
    const stack = ["memory", "confirm", "toast"];
    expect(modalZIndex(stack, "memory")).toBe(MODAL_BASE_Z_INDEX);
    expect(modalZIndex(stack, "confirm")).toBe(MODAL_BASE_Z_INDEX + 1);
    expect(modalZIndex(stack, "toast")).toBe(MODAL_BASE_Z_INDEX + 2);
  });

  it("不在栈中时回退基础值", () => {
    expect(modalZIndex([], "a")).toBe(MODAL_BASE_Z_INDEX);
  });
});

describe("scrollLockActive", () => {
  it("栈空不锁、栈非空即锁", () => {
    expect(scrollLockActive([])).toBe(false);
    expect(scrollLockActive(["a"])).toBe(true);
    expect(scrollLockActive(["a", "b"])).toBe(true);
  });

  it("叠层弹窗关一层仍保持锁定，关到最后一个才解锁", () => {
    let stack = pushModal(pushModal([], "a"), "b");
    stack = popModal(stack, "b");
    expect(scrollLockActive(stack)).toBe(true);
    stack = popModal(stack, "a");
    expect(scrollLockActive(stack)).toBe(false);
  });
});

describe("模块级 store（register / unregister）", () => {
  beforeEach(() => {
    // 排空模块栈，保证用例互不影响（node 环境无 document，滚动锁为安全空操作）
    [...getModalStack()].forEach(unregisterModal);
  });

  it("注册即入栈，注销即出栈，锁状态随栈空切换", () => {
    registerModal("a");
    expect(getModalStack()).toEqual(["a"]);
    expect(scrollLockActive(getModalStack())).toBe(true);
    registerModal("b");
    expect(getModalStack()).toEqual(["a", "b"]);
    unregisterModal("b");
    expect(getModalStack()).toEqual(["a"]);
    expect(scrollLockActive(getModalStack())).toBe(true);
    unregisterModal("a");
    expect(getModalStack()).toEqual([]);
    expect(scrollLockActive(getModalStack())).toBe(false);
  });

  it("重复注册与重复注销均幂等", () => {
    registerModal("a");
    registerModal("a");
    expect(getModalStack()).toEqual(["a"]);
    unregisterModal("a");
    unregisterModal("a");
    expect(getModalStack()).toEqual([]);
  });

  it("注销栈中下层弹窗时锁定保持、上层顺序不受影响", () => {
    registerModal("a");
    registerModal("b");
    unregisterModal("a");
    expect(getModalStack()).toEqual(["b"]);
    expect(isTopModal(getModalStack(), "b")).toBe(true);
    expect(scrollLockActive(getModalStack())).toBe(true);
    unregisterModal("b");
  });

  it("订阅者在栈变化时收到通知，取消订阅后不再通知", () => {
    let calls = 0;
    const unsubscribe = subscribeModalStack(() => {
      calls += 1;
    });
    registerModal("a");
    unregisterModal("a");
    unsubscribe();
    registerModal("a");
    unregisterModal("a");
    expect(calls).toBe(2);
  });
});
