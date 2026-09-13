/**
 * 「关联 X」指令识别与任务解析。
 *
 * 后端解析层（AI 提示词 + 本地 NLP）会把「关联 X」子句提取到 linkTask 字段并从
 * 事项名剔除；本模块是前端消费侧的第二道防线：
 * 1. 显式 linkTask 字段的本地解析（精确/包含/模糊），失败时回退 /match-task 语义匹配；
 * 2. 名字守卫：LLM 偶发不服从提示词、把「关联 X」拼进块名时，按分段提取并剔除。
 *    守卫只做本地解析且解析不到任务就保持原名，避免误伤「关联分析」类真实事项名。
 */

// 段级指令模式：整段以「关联」开头，可选介词/宾语类型词与冒号；或「挂到 X 下」
const LINK_DIRECTIVE_RE = /^关联(?:到|至|给)?(?:任务|项目)?\s*[:：]?\s*(.+)$/;
const LINK_HANG_RE = /^挂到\s*[:：]?\s*(.+?)下$/;

// 分段符：后端同时段合并用 " + " 连接（两侧必须有空格，避免拆散 "C++ 学习" 这类名字），以及中文分句符号
const SEGMENT_SPLIT_RE = / \+ |＋|，|,|；|;|、/;

function hasMeaningfulText(text: string): boolean {
  // JS 的 \w 仅含 ASCII，中文须用 Unicode 字母属性判断（对齐后端 has_meaningful_name）
  return /\p{L}/u.test(text);
}

export function extractLinkDirectiveTarget(segment: string): string | null {
  const trimmed = segment.trim();
  const match = LINK_DIRECTIVE_RE.exec(trimmed) ?? LINK_HANG_RE.exec(trimmed);
  if (!match) return null;
  const target = match[1].trim();
  return target && hasMeaningfulText(target) ? target : null;
}

export interface LinkDirectiveExtraction {
  /** 剔除指令段后的名字；无指令或整名都是指令时与输入相同 */
  cleanedName: string;
  /** 提取到的关联目标（按出现顺序）；无法安全剔除时为空数组 */
  targets: string[];
}

export function extractLinkDirectives(name: string): LinkDirectiveExtraction {
  const segments = name
    .split(SEGMENT_SPLIT_RE)
    .map((segment) => segment.trim())
    .filter(Boolean);
  const targets: string[] = [];
  const remaining: string[] = [];
  for (const segment of segments) {
    const target = extractLinkDirectiveTarget(segment);
    if (target) {
      targets.push(target);
    } else {
      remaining.push(segment);
    }
  }
  if (targets.length === 0 || remaining.length === 0) {
    return { cleanedName: name, targets: [] };
  }
  return { cleanedName: remaining.join(" + "), targets };
}

export interface LinkTaskCandidate {
  id: string;
  name: string;
}

/** 与后端 match_task._normalize 同规则：去空白与 -_. ,/ 后转小写 */
function normalizeTaskName(text: string): string {
  return text.replace(/[\s\-_.,/]+/g, "").toLowerCase();
}

// 模糊兜底阈值：字符 bigram Dice 相似度。0.7 可容许 8 字名错 1-2 字（时/实类
// 语音输入变体），又不会把无关联的短名误连
const FUZZY_MATCH_THRESHOLD = 0.7;

function bigramDice(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const counts = new Map<string, number>();
  for (let i = 0; i < b.length - 1; i += 1) {
    const gram = b.slice(i, i + 2);
    counts.set(gram, (counts.get(gram) ?? 0) + 1);
  }
  let overlap = 0;
  for (let i = 0; i < a.length - 1; i += 1) {
    const gram = a.slice(i, i + 2);
    const n = counts.get(gram) ?? 0;
    if (n > 0) {
      overlap += 1;
      counts.set(gram, n - 1);
    }
  }
  return (2 * overlap) / (a.length + b.length - 2);
}

/**
 * 本地解析关联目标 → 任务 ID：归一化精确相等 → 「目标包含完整任务名」（目标带
 * 「项目/任务」等修饰词时）→ bigram 模糊兜底（错别字/语音输入变体如「时惠环球」
 * vs「实惠环球」，唯一最佳候选且双方归一化后 ≥4 字才命中，省一次 /match-task AI
 * 往返）。不含反向包含，短目标（如误提取的"分析"）不因任务名的子串关系误绑定；
 * 解析不到返回 null。
 */
export function resolveLinkTargetLocal(
  target: string,
  tasks: LinkTaskCandidate[]
): string | null {
  const normalizedTarget = normalizeTaskName(target);
  if (!normalizedTarget) return null;
  const exact = tasks.find(
    (task) => normalizeTaskName(task.name) === normalizedTarget
  );
  if (exact) return exact.id;
  const decorated = tasks.find((task) => {
    const normalized = normalizeTaskName(task.name);
    return normalized.length > 0 && normalizedTarget.includes(normalized);
  });
  if (decorated) return decorated.id;
  if (normalizedTarget.length < 4) return null;
  let best: { id: string; score: number } | null = null;
  let tied = false;
  for (const task of tasks) {
    const normalized = normalizeTaskName(task.name);
    if (normalized.length < 4) continue;
    const score = bigramDice(normalizedTarget, normalized);
    if (score < FUZZY_MATCH_THRESHOLD) continue;
    if (!best || score > best.score) {
      best = { id: task.id, score };
      tied = false;
    } else if (score === best.score) {
      tied = true;
    }
  }
  return best && !tied ? best.id : null;
}
