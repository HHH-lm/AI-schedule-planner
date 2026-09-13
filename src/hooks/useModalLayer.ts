"use client";

import { useEffect, useId, useRef, useSyncExternalStore } from "react";
import {
  EMPTY_MODAL_STACK,
  MODAL_BASE_Z_INDEX,
  getModalStack,
  isTopModal,
  modalZIndex,
  registerModal,
  subscribeModalStack,
  unregisterModal,
} from "@/lib/modalStack";

interface Options {
  /**
   * 弹窗是否实际打开。独立弹窗组件（只在打开时挂载）可省略；
   * 页面/视图内联弹窗（如 Toast、折叠区间弹窗）传 `active: !!state`
   * 以便在常驻组件中调用本 hook。
   */
  active?: boolean;
  /** Esc 回调：仅当本弹窗处于栈顶时触发（后进先出） */
  onEscape?: () => void;
}

/**
 * 弹窗层注册（F-036）：入栈/出栈、背景滚动锁定（栈空才解锁）、
 * Esc 只归栈顶、层级 z-index 按栈深递增。
 * 返回的 zIndex 内联到 `.modal-backdrop` 上覆盖样式表的默认值。
 */
export function useModalLayer({ active = true, onEscape }: Options = {}): {
  zIndex: number;
} {
  const id = useId();
  const stack = useSyncExternalStore(
    subscribeModalStack,
    getModalStack,
    () => EMPTY_MODAL_STACK
  );
  const onEscapeRef = useRef(onEscape);

  useEffect(() => {
    onEscapeRef.current = onEscape;
  }, [onEscape]);

  useEffect(() => {
    if (!active) return;
    registerModal(id);
    return () => unregisterModal(id);
  }, [active, id]);

  useEffect(() => {
    if (!active) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (!isTopModal(getModalStack(), id)) return;
      onEscapeRef.current?.();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [active, id]);

  return { zIndex: active ? modalZIndex(stack, id) : MODAL_BASE_Z_INDEX };
}
