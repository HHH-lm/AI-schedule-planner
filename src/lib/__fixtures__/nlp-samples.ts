import type { ParsedSchedule } from "../types";

export interface NlpSample {
  input: string;
  slice: "normal" | "boundary" | "reject";
  note?: string;
  expectedCount?: number;
  expected: Partial<ParsedSchedule>;
}

// 基准时间固定为 2026-08-03（周一）12:00。
// 周几解析以该时间点为锚，取下一个指定星期几（含当天），不再绑定展示周。
// reject 样本记录当前解析器的确定性行为，其中部分属于待改进缺陷。
export const nlpSamples: NlpSample[] = [
  {
    input: "周二下午2点到5点写代码在深圳湾",
    slice: "normal",
    note: "逗号会按多句拆分，地点需要写在句末才能归属当前事项",
    expected: {
      name: "写代码",
      date: "2026-08-04",
      start: 14 * 60,
      end: 17 * 60,
      category: "work",
      location: "深圳湾",
    },
  },
  {
    input: "周二下午2点到4点健身，地点健身房",
    slice: "normal",
    note: "独立地点片段应合并到前一个活动块，不再生成默认时间的新块",
    expected: {
      name: "健身",
      date: "2026-08-04",
      start: 14 * 60,
      end: 16 * 60,
      category: "fitness",
      location: "健身房",
    },
  },
  {
    input: "周二下午2点到 4 点健身，地点健身房",
    slice: "normal",
    note: "数字和点之间有空格时，时间解析也要消费完整的点，避免残留进活动名",
    expected: {
      name: "健身",
      date: "2026-08-04",
      start: 14 * 60,
      end: 16 * 60,
      category: "fitness",
      location: "健身房",
    },
  },
  {
    input: "地点深圳湾",
    slice: "reject",
    note: "没有前一个活动块可归属时，独立地点句被忽略",
    expectedCount: 0,
    expected: {},
  },
  {
    input: "周三上午10点健身",
    slice: "normal",
    expected: {
      name: "健身",
      date: "2026-08-05",
      start: 10 * 60,
      end: 11 * 60,
      category: "fitness",
    },
  },
  {
    input: "明天晚上8点吃饭",
    slice: "normal",
    expected: {
      name: "吃饭",
      date: "2026-08-04",
      start: 20 * 60,
      end: 21 * 60,
      category: "life",
    },
  },
  {
    input: "今天下午3点到4点开会",
    slice: "normal",
    expected: {
      name: "开会",
      date: "2026-08-03",
      start: 15 * 60,
      end: 16 * 60,
      category: "work",
    },
  },
  {
    input: "凌晨12点到1点整理资料",
    slice: "boundary",
    expected: {
      name: "整理资料",
      date: "2026-08-03",
      start: 0,
      end: 60,
      category: "life",
    },
  },
  {
    input: "周日下午4点休息",
    slice: "boundary",
    expected: {
      name: "休息",
      date: "2026-08-09",
      start: 16 * 60,
      end: 17 * 60,
      category: "rest",
    },
  },
  {
    input: "晚上11点30分睡觉",
    slice: "boundary",
    expected: {
      name: "睡觉",
      date: "2026-08-03",
      start: 23 * 60 + 30,
      end: 23 * 60 + 30 + 60,
      category: "rest",
    },
  },
  {
    input: "写代码",
    slice: "boundary",
    note: "无时间时默认 9:00-10:00",
    expected: {
      name: "写代码",
      date: "2026-08-03",
      start: 9 * 60,
      end: 10 * 60,
      category: "work",
    },
  },
  {
    input: "周日晚上10点到11点阅读",
    slice: "boundary",
    expected: {
      name: "阅读",
      date: "2026-08-09",
      start: 22 * 60,
      end: 23 * 60,
      category: "study",
    },
  },
  {
    input: "!!!###",
    slice: "reject",
    note: "无意义输入被拒答，不再生成默认时间块",
    expectedCount: 0,
    expected: {},
  },
  {
    input: "周八开会",
    slice: "reject",
    note: "无效星期被拒答，不再回退到当天",
    expectedCount: 0,
    expected: {},
  },
  {
    input: "明天",
    slice: "reject",
    note: "只有日期没有事项名称时被拒答，不再使用默认名称",
    expectedCount: 0,
    expected: {},
  },
];
