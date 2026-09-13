"use client";

import type { ReactNode } from "react";
import { useModalLayer } from "@/hooks/useModalLayer";

interface Props {
  /** 点击遮罩关闭（与存量弹窗一致的 onMouseDown 语义）；不传则点遮罩不关闭 */
  onClose?: () => void;
  /** Esc 回调，默认同 onClose；两段式等特殊语义时单独传 */
  onEscape?: () => void;
  children: ReactNode;
}

/**
 * 弹窗统一外壳（F-038 约定）：新增弹窗一律用它承载遮罩层，
 * 背景滚动锁、Esc 栈顶路由（后进先出）与 z-index 按栈深递增由弹窗栈统一接管。
 * 勿手写 modal-backdrop、自带 body overflow 锁或组件内 Escape 监听
 * ——守卫见 src/lib/modalStack.guard.test.ts（随 npm test 执行，违规即失败）。
 */
export default function ModalLayer({ onClose, onEscape, children }: Props) {
  const { zIndex } = useModalLayer({ onEscape: onEscape ?? onClose });
  return (
    <div className="modal-backdrop" style={{ zIndex }} onMouseDown={onClose}>
      {children}
    </div>
  );
}
