"use client";

import { useState } from "react";
import { BookMarked, Clock, MapPin, Tag, Trash2, X } from "lucide-react";
import type { Category, TimeBlock } from "@/lib/types";
import { CATEGORIES, CATEGORY_ORDER } from "@/lib/categories";
import { minutesToHHMM } from "@/lib/date";
import { buildObsidianUrl, parseObsidianUrl } from "@/lib/obsidian";

interface Props {
  block: TimeBlock | null;
  defaultDate: string;
  defaultStart?: number;
  defaultObsidianVault?: string;
  tasks: Array<{ id: string; name: string }>;
  onSave: (draft: Partial<TimeBlock>, id?: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

function timeToMinutes(value: string): number {
  const [h, m] = value.split(":").map(Number);
  if (!Number.isFinite(h)) return 9 * 60;
  return h * 60 + (Number.isFinite(m) ? m : 0);
}

export default function BlockModal({
  block,
  defaultDate,
  defaultStart,
  defaultObsidianVault,
  tasks,
  onSave,
  onDelete,
  onClose,
}: Props) {
  const initialParsedNote = parseObsidianUrl(block?.obsidianNote ?? "");
  const initialObsidianVault =
    initialParsedNote.vault ?? block?.obsidianVault ?? "";
  const initialObsidianNote =
    initialParsedNote.file ?? block?.obsidianNote ?? "";
  const [name, setName] = useState(block?.name ?? "");
  const [date, setDate] = useState(block?.date ?? defaultDate);
  const [startText, setStartText] = useState(
    minutesToHHMM(block?.start ?? defaultStart ?? 9 * 60)
  );
  const [endText, setEndText] = useState(
    minutesToHHMM(
      block?.end ?? Math.min(1440, (defaultStart ?? 9 * 60) + 60)
    )
  );
  const [category, setCategory] = useState<Category>(block?.category ?? "work");
  const [location, setLocation] = useState(block?.location ?? "");
  const [taskId, setTaskId] = useState(block?.taskId ?? "");
  const [done, setDone] = useState(block?.done ?? false);
  const [obsidianVault, setObsidianVault] = useState(initialObsidianVault);
  const [obsidianNote, setObsidianNote] = useState(initialObsidianNote);
  const [obsidianLink, setObsidianLink] = useState(
    initialObsidianVault
      ? buildObsidianUrl(initialObsidianVault, initialObsidianNote)
      : ""
  );

  const handleObsidianLinkChange = (value: string) => {
    setObsidianLink(value);
    const parsed = parseObsidianUrl(value);
    if (parsed.vault) setObsidianVault(parsed.vault);
    if (parsed.file) setObsidianNote(parsed.file);
  };

  const handleSave = () => {
    let start = timeToMinutes(startText);
    let end = timeToMinutes(endText);
    if (end <= start) end = Math.min(1440, start + 30);
    const noteRaw = obsidianNote.trim();
    const noteParsed = parseObsidianUrl(noteRaw);
    const resolvedVault = noteParsed.vault || obsidianVault.trim() || undefined;
    const resolvedNote = noteParsed.file || noteRaw || undefined;
    onSave(
      {
        name: name.trim() || "未命名事项",
        date,
        start,
        end,
        category,
        location: location.trim() || undefined,
        taskId: taskId || undefined,
        obsidianVault: resolvedVault,
        obsidianNote: resolvedNote,
        done,
        status: "scheduled",
      },
      block?.id
    );
    onClose();
  };

  const inputClass =
    "w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
  const labelClass = "mb-1 block text-xs font-medium text-slate-600";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4"
      onMouseDown={onClose}
    >
      <div
        className="w-full max-w-lg rounded-lg bg-white shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h3 className="text-sm font-semibold">
            {block ? "编辑时间块" : "新建时间块"}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3 px-4 py-4">
          {block?.status === "pending" && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              这是一个待排期时间块，设置起止时间后会自动进入周时间轴。
            </div>
          )}

          <div>
            <label className={labelClass}>事项</label>
            <div className="flex items-center gap-2">
              <Tag size={15} className="shrink-0 text-slate-400" />
              <input
                className={inputClass}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="例如：写代码"
                autoFocus
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>日期</label>
              <input
                type="date"
                className={inputClass}
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </div>
            <div>
              <label className={labelClass}>类目</label>
              <select
                className={inputClass}
                value={category}
                onChange={(event) => setCategory(event.target.value as Category)}
              >
                {CATEGORY_ORDER.map((key) => (
                  <option key={key} value={key}>
                    {CATEGORIES[key].label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>开始时间</label>
              <div className="flex items-center gap-2">
                <Clock size={15} className="shrink-0 text-slate-400" />
                <input
                  type="time"
                  className={inputClass}
                  value={startText}
                  onChange={(event) => setStartText(event.target.value)}
                />
              </div>
            </div>
            <div>
              <label className={labelClass}>结束时间</label>
              <div className="flex items-center gap-2">
                <Clock size={15} className="shrink-0 text-slate-400" />
                <input
                  type="time"
                  className={inputClass}
                  value={endText}
                  onChange={(event) => setEndText(event.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>地点</label>
              <div className="flex items-center gap-2">
                <MapPin size={15} className="shrink-0 text-slate-400" />
                <input
                  className={inputClass}
                  value={location}
                  onChange={(event) => setLocation(event.target.value)}
                  placeholder="例如：深圳湾"
                />
              </div>
            </div>
            <div>
              <label className={labelClass}>关联任务</label>
              <select
                className={inputClass}
                value={taskId}
                onChange={(event) => setTaskId(event.target.value)}
              >
                <option value="">不关联</option>
                {tasks.map((task) => (
                  <option key={task.id} value={task.id}>
                    {task.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <div className="mb-1 flex items-center gap-1.5">
              <BookMarked size={13} className="text-slate-400" />
              <span className={labelClass}>Obsidian 关联</span>
            </div>
            <div className="mb-3">
              <label className={labelClass}>Obsidian 链接</label>
              <input
                className={inputClass}
                value={obsidianLink}
                onChange={(event) =>
                  handleObsidianLinkChange(event.target.value)
                }
                placeholder="obsidian://open?vault=...&file=..."
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>知识库</label>
                <input
                  className={inputClass}
                  value={obsidianVault}
                  onChange={(event) => setObsidianVault(event.target.value)}
                  placeholder={
                    defaultObsidianVault
                      ? `默认：${defaultObsidianVault}`
                      : "例如：我的知识库"
                  }
                />
              </div>
              <div>
                <label className={labelClass}>笔记路径</label>
                <input
                  className={inputClass}
                  value={obsidianNote}
                  onChange={(event) => setObsidianNote(event.target.value)}
                  placeholder="例如：项目/写AI应用文章"
                />
              </div>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={done}
              onChange={(event) => setDone(event.target.checked)}
              className="h-4 w-4 rounded border-slate-300 accent-emerald-600"
            />
            标记为完成
          </label>
        </div>

        <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3">
          {block ? (
            <button
              type="button"
              onClick={() => {
                onDelete(block.id);
                onClose();
              }}
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-rose-600 hover:bg-rose-50"
            >
              <Trash2 size={14} />
              删除
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={handleSave}
            className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
