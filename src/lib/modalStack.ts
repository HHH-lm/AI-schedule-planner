/**
 * 弹窗栈：全站弹窗/浮层的统一管理层（F-036）。
 *
 * 三条规则：
 * 1. 任一弹窗在栈中即锁定页面背景滚动（body overflow:hidden，按 CSS 规则传播到视口），最后一个关闭才解锁；
 * 2. Esc 只归栈顶弹窗——后进先出，叠层弹窗（如确认框）先关最上层；
 * 3. 层级 z-index 按栈深递增，叠层不再依赖 DOM 渲染顺序。
 *
 * 纯函数部分与模块级 store 分离：前者可单测，后者只在客户端 effect 中触碰 document/window。
 */

export const MODAL_BASE_Z_INDEX = 50;

/** 服务端渲染快照：弹窗恒为关闭（稳定空引用，供 useSyncExternalStore） */
export const EMPTY_MODAL_STACK: readonly string[] = [];

// ---------- 纯函数（栈操作，不可变） ----------

/** 入栈（追加到栈顶），返回新数组 */
export function pushModal(stack: readonly string[], id: string): string[] {
  return [...stack, id];
}

/** 按 id 出栈（容错：id 不在栈中时等价原样返回），返回新数组 */
export function popModal(stack: readonly string[], id: string): string[] {
  return stack.filter((entry) => entry !== id);
}

/** 是否栈顶（后进先出：只有栈顶响应 Esc） */
export function isTopModal(stack: readonly string[], id: string): boolean {
  return stack.length > 0 && stack[stack.length - 1] === id;
}

/** 栈深对应的 z-index：底层为基础值、每上一层 +1；不在栈中回退基础值 */
export function modalZIndex(stack: readonly string[], id: string): number {
  const depth = stack.indexOf(id);
  return depth < 0 ? MODAL_BASE_Z_INDEX : MODAL_BASE_Z_INDEX + depth;
}

/** 是否需要锁定背景滚动：栈非空即锁 */
export function scrollLockActive(stack: readonly string[]): boolean {
  return stack.length > 0;
}

// ---------- 模块级 store（客户端） ----------

let stack: string[] = [];
const listeners = new Set<() => void>();
let savedBodyOverflow: string | null = null;

function emit(): void {
  listeners.forEach((listener) => listener());
}

/** useSyncExternalStore 客户端快照（引用在两次变更间保持稳定） */
export function getModalStack(): readonly string[] {
  return stack;
}

export function subscribeModalStack(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function registerModal(id: string): void {
  if (stack.includes(id)) return; // StrictMode 双挂载幂等
  const wasEmpty = stack.length === 0;
  stack = pushModal(stack, id);
  if (wasEmpty) lockPageScroll();
  emit();
}

export function unregisterModal(id: string): void {
  if (!stack.includes(id)) return; // 重复清理幂等
  stack = popModal(stack, id);
  if (stack.length === 0) unlockPageScroll();
  emit();
}

function lockPageScroll(): void {
  if (typeof document === "undefined") return;
  // 只锁 body：html 保持 visible 时 body 的 hidden 按 CSS 规则传播到视口，
  // 滚动同样被锁住；html+body 同锁在 html/body height:100% 结构下会把
  // 视口滚动位置打回 0（弹窗一开页面跳顶，F-037 实测）。
  savedBodyOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";
}

function unlockPageScroll(): void {
  if (typeof document === "undefined") return;
  document.body.style.overflow = savedBodyOverflow ?? "";
  savedBodyOverflow = null;
}
