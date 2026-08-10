import type { Category } from "./types";

export interface CategoryMeta {
  label: string;
  dot: string;
  text: string;
  bg: string;
  border: string;
  solid: string;
  soft: string;
}

export const CATEGORIES: Record<Category, CategoryMeta> = {
  work: {
    label: "工作",
    dot: "cat-dot-work",
    text: "cat-text-work",
    bg: "cat-bg-work",
    border: "cat-border-work",
    solid: "cat-solid-work",
    soft: "rgba(0, 102, 204, 0.10)",
  },
  study: {
    label: "学习",
    dot: "cat-dot-study",
    text: "cat-text-study",
    bg: "cat-bg-study",
    border: "cat-border-study",
    solid: "cat-solid-study",
    soft: "rgba(13, 148, 136, 0.10)",
  },
  fitness: {
    label: "健身",
    dot: "cat-dot-fitness",
    text: "cat-text-fitness",
    bg: "cat-bg-fitness",
    border: "cat-border-fitness",
    solid: "cat-solid-fitness",
    soft: "rgba(34, 160, 94, 0.11)",
  },
  life: {
    label: "生活",
    dot: "cat-dot-life",
    text: "cat-text-life",
    bg: "cat-bg-life",
    border: "cat-border-life",
    solid: "cat-solid-life",
    soft: "rgba(217, 119, 6, 0.10)",
  },
  rest: {
    label: "休息",
    dot: "cat-dot-rest",
    text: "cat-text-rest",
    bg: "cat-bg-rest",
    border: "cat-border-rest",
    solid: "cat-solid-rest",
    soft: "rgba(142, 142, 147, 0.12)",
  },
};

export const CATEGORY_ORDER: Category[] = ["work", "study", "fitness", "life", "rest"];

const CATEGORY_KEYWORDS: Array<[RegExp, Category]> = [
  [/写代码|编程|开发|代码|工作|开会|会议|客户|需求|办公|文案|项目|周报|代码评审/i, "work"],
  [/学习|阅读|读书|课程|上课|考试|背单词|研究|论文|写作|写文章|AI|教程/i, "study"],
  [/健身|跑步|运动|游泳|瑜伽|篮球|羽毛球|力量|拉伸|锻炼|骑行/i, "fitness"],
  [/睡觉|休息|午休|冥想|放松|散步/i, "rest"],
  [/吃饭|午餐|晚餐|早餐|买菜|做饭|家务|通勤|生活/i, "life"],
];

export function guessCategory(text: string): Category {
  for (const [pattern, category] of CATEGORY_KEYWORDS) {
    if (pattern.test(text)) return category;
  }
  return "life";
}
