/**
 * 「标记为已完成」完成指令识别（前端名字守卫）。
 *
 * 后端解析层（AI 提示词 + 本地 NLP）会把「标记为已完成」等指令子句从事项名
 * 剔除并置 done=true；本模块是前端消费侧的第二道防线：LLM 偶发不服从提示词、
 * 把指令子句拼进块名时，按分段/段尾提取并剔除。
 * 守卫只在能安全剥离时才改写名字（剥完不为空），避免误伤「已完成项目复盘」类
 * 真实名称；裸「完成」不构成指令，避免误伤「3点前完成」这类截止表述。
 */

// 段级指令模式：整段仅为完成指令（须含标记动词或已/了等完成体标记，裸「完成」不算）
const DONE_DIRECTIVE_RE =
  /^(?:请\s*)?(?:帮\s*(?:我)?\s*)?(?:(?:标记|记|设|算|勾选)(?:为|成|作)?(?:已经?)?完成|(?:都|全部)?已经?完成了?|完成(?:了|掉)[。.！!～~]?|(?:做|办)完了[。.！!～~]?)[。.！!～~]?$/;

// 段尾后缀模式：「开会 标记为已完成」——从段尾剥离指令子句
const DONE_SUFFIX_RE =
  /[\s，,、；;。]*(?:(?:标记|记|设|算|勾选)(?:为|成|作)?(?:已经?)?完成|已经?完成了?|完成(?:了|掉)|(?:做|办)完了)\s*[。.！!～~]?$/;

// 分段符与 linkDirective 相同：后端同时段合并用 " + " 连接（两侧必须有空格，
// 避免拆散 "C++ 学习" 这类名字），以及中文分句符号
const SEGMENT_SPLIT_RE = / \+ |＋|，|,|；|;|、/;

export interface DoneDirectiveExtraction {
  /** 是否命中完成指令 */
  done: boolean;
  /** 剔除指令后的名字；未命中或无法安全剥离时与输入相同 */
  cleanedName: string;
}

export function extractDoneDirective(name: string): DoneDirectiveExtraction {
  const segments = name
    .split(SEGMENT_SPLIT_RE)
    .map((segment) => segment.trim())
    .filter(Boolean);
  const remaining: string[] = [];
  let done = false;
  for (const segment of segments) {
    if (DONE_DIRECTIVE_RE.test(segment)) {
      done = true;
      continue;
    }
    const suffix = DONE_SUFFIX_RE.exec(segment);
    if (suffix && segment.slice(0, suffix.index).trim()) {
      done = true;
      remaining.push(segment.slice(0, suffix.index).trim());
      continue;
    }
    remaining.push(segment);
  }
  if (!done || remaining.length === 0) {
    return { done: false, cleanedName: name };
  }
  return { done, cleanedName: remaining.join(" + ") };
}
