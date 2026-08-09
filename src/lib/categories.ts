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
    dot: "bg-orange-600",
    text: "text-orange-700",
    bg: "bg-orange-50",
    border: "border-orange-300",
    solid: "bg-orange-600",
    soft: "#ffedd5",
  },
  study: {
    label: "学习",
    dot: "bg-blue-600",
    text: "text-blue-700",
    bg: "bg-blue-50",
    border: "border-blue-300",
    solid: "bg-blue-600",
    soft: "#dbeafe",
  },
  fitness: {
    label: "健身",
    dot: "bg-emerald-600",
    text: "text-emerald-700",
    bg: "bg-emerald-50",
    border: "border-emerald-300",
    solid: "bg-emerald-600",
    soft: "#d1fae5",
  },
  life: {
    label: "生活",
    dot: "bg-rose-600",
    text: "text-rose-700",
    bg: "bg-rose-50",
    border: "border-rose-300",
    solid: "bg-rose-600",
    soft: "#ffe4e6",
  },
  rest: {
    label: "休息",
    dot: "bg-slate-500",
    text: "text-slate-600",
    bg: "bg-slate-100",
    border: "border-slate-300",
    solid: "bg-slate-500",
    soft: "#e2e8f0",
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
