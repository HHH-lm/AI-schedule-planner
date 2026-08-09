import type { AppData, Task, TimeBlock } from "./types";
import { getWeekDays } from "./date";

export function makeSampleData(): AppData {
  const days = getWeekDays(0);
  const tuesday = days[1];
  const wednesday = days[2];
  const thursday = days[3];

  const tasks: Task[] = [
    {
      id: "task-video",
      name: "做一期视频",
      date: thursday.key,
      status: "todo",
      subtasks: [
        { id: "sub-1", name: "选题与脚本", done: true },
        { id: "sub-2", name: "拍摄 B-roll", done: false },
        { id: "sub-3", name: "剪辑与字幕", done: false },
      ],
    },
    {
      id: "task-article",
      name: "写 AI 应用文章",
      date: tuesday.key,
      status: "todo",
      subtasks: [
        { id: "sub-4", name: "整理案例素材", done: false },
        { id: "sub-5", name: "完成初稿", done: false },
      ],
    },
    {
      id: "task-review",
      name: "月度复盘",
      date: null,
      status: "todo",
      subtasks: [{ id: "sub-6", name: "汇总本月数据", done: false }],
      pinned: true,
    },
  ];

  const timeBlocks: TimeBlock[] = [
    {
      id: "block-1",
      taskId: "task-article",
      name: "写文章初稿",
      date: tuesday.key,
      start: 9 * 60,
      end: 12 * 60,
      category: "study",
      location: "家",
      done: false,
      status: "scheduled",
    },
    {
      id: "block-2",
      name: "需求评审会",
      date: tuesday.key,
      start: 14 * 60,
      end: 16 * 60,
      category: "work",
      location: "深圳湾",
      done: false,
      status: "scheduled",
    },
    {
      id: "block-3",
      name: "晨跑",
      date: wednesday.key,
      start: 7 * 60 + 30,
      end: 8 * 60 + 30,
      category: "fitness",
      location: "深圳湾",
      done: true,
      status: "scheduled",
    },
    {
      id: "block-4",
      name: "AI 课程",
      date: wednesday.key,
      start: 19 * 60,
      end: 21 * 60,
      category: "study",
      location: "家",
      done: false,
      status: "scheduled",
    },
    {
      id: "block-5",
      taskId: "task-video",
      name: "拍摄 B-roll",
      date: thursday.key,
      start: 9 * 60,
      end: 11 * 60,
      category: "work",
      location: "工作室",
      done: false,
      status: "scheduled",
    },
    {
      id: "block-6",
      taskId: "task-video",
      name: "做一期视频",
      date: thursday.key,
      start: 0,
      end: 60,
      category: "life",
      done: false,
      status: "pending",
    },
  ];

  return { version: 1, tasks, timeBlocks };
}
