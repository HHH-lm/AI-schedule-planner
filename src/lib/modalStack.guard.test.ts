import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * 弹窗栈守卫（F-038）：随 npm test（含 CI）执行，防止未来新弹窗
 * 绕过弹窗栈机制——手写遮罩、自带滚动锁、组件私挂 Esc 监听。
 * 规则为「坏模式检测」而非穷举白名单，存量弹窗（hook 直调或 ModalLayer）均放行。
 */

const SRC_ROOT = fileURLToPath(new URL("..", import.meta.url));

const MODAL_BACKDROP_STYLE_SHEET = "app/globals.css";
const OVERFLOW_LOCK_OWNER = "lib/modalStack.ts";
const ESCAPE_HANDLER_OWNER = "hooks/useModalLayer.ts";
// 守卫自身是执法代码：检测规则字符串（"style.overflow"、'"Escape"'）写在文件里，
// 必须从扫描中排除，否则守卫抓到自己。
const GUARD_SELF = "lib/modalStack.guard.test.ts";

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return listSourceFiles(full);
    return /\.(ts|tsx|css)$/.test(entry) ? [full] : [];
  });
}

function relPath(full: string): string {
  return relative(SRC_ROOT, full).replaceAll("\\", "/");
}

const sourceFiles = listSourceFiles(SRC_ROOT).filter(
  (file) => relPath(file) !== GUARD_SELF
);

describe("弹窗栈守卫（F-038）", () => {
  it("含 modal-backdrop 的文件必须接入弹窗栈（useModalLayer 或 ModalLayer；样式定义除外）", () => {
    const offenders = sourceFiles
      .filter((file) => {
        const content = readFileSync(file, "utf8");
        return (
          content.includes("modal-backdrop") &&
          !content.includes("ModalLayer") &&
          relPath(file) !== MODAL_BACKDROP_STYLE_SHEET
        );
      })
      .map(relPath);
    expect(
      offenders,
      "发现手写弹窗遮罩：请用 src/components/ModalLayer.tsx 承载遮罩（滚动锁/Esc/层级由弹窗栈统一管）。违规文件："
    ).toEqual([]);
  });

  it("背景滚动锁只许在 modalStack.ts，弹窗组件不得自带 overflow 锁", () => {
    const offenders = sourceFiles
      .filter((file) => readFileSync(file, "utf8").includes("style.overflow"))
      .map(relPath)
      .filter((path) => path !== OVERFLOW_LOCK_OWNER);
    expect(
      offenders,
      "弹窗外自带滚动锁会与弹窗栈锁计数冲突（跳顶/漏解锁）：滚动锁统一在 src/lib/modalStack.ts。违规文件："
    ).toEqual([]);
  });

  it("Escape 键处理只许在 useModalLayer.ts，特殊语义写进 onEscape 回调", () => {
    const offenders = sourceFiles
      .filter((file) => readFileSync(file, "utf8").includes('"Escape"'))
      .map(relPath)
      .filter((path) => path !== ESCAPE_HANDLER_OWNER);
    expect(
      offenders,
      "组件私挂 Escape 监听会复发叠层双关问题：Esc 只归栈顶（src/hooks/useModalLayer.ts），特殊语义传 onEscape。违规文件："
    ).toEqual([]);
  });
});
