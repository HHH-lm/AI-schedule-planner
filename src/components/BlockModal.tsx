"use client";

import { useEffect, useState } from "react";
import { BookMarked, Clock, MapPin, Tag, Trash2, X } from "lucide-react";
import type { Category, TimeBlock } from "@/lib/types";
import { CATEGORIES, CATEGORY_ORDER } from "@/lib/categories";
import {
  minutesToHHMM,
  parseDateKey,
  remindBeforeInput,
} from "@/lib/date";
import {
  endDateKey,
  endMinutes,
  MINUTES_PER_DAY,
} from "@/lib/blockTime";
import { buildObsidianUrl, parseObsidianUrl } from "@/lib/obsidian";

interface Props {
  block: TimeBlock | null;
  defaultDate: string;
  defaultStart?: number;
  defaultObsidianVault?: string;
  tasks: Array<{ id: string; name: string }>;
  onSave: (
    draft: Partial<TimeBlock> & { syncTask?: boolean },
    id?: string
  ) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

function timeToMinutes(value: string): number {
  const [h, m] = value.split(":").map(Number);
  if (!Number.isFinite(h)) return 9 * 60;
  return h * 60 + (Number.isFinite(m) ? m : 0);
}

function isoToLocalInput(iso: string | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
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
  const initialStartMinutes = block?.start ?? defaultStart ?? 9 * 60;
  const initialRemindInput = isoToLocalInput(block?.remindAt);
  const initialParsedNote = parseObsidianUrl(block?.obsidianNote ?? "");
  const initialObsidianVault =
    initialParsedNote.vault ?? block?.obsidianVault ?? "";
  const initialObsidianNote =
    initialParsedNote.file ?? block?.obsidianNote ?? "";
  const [name, setName] = useState(block?.name ?? "");
  const [date, setDate] = useState(block?.date ?? defaultDate);
  const [startText, setStartText] = useState(
    minutesToHHMM(initialStartMinutes)
  );
  const initialEndDate = block ? endDateKey(block) : defaultDate;
  const initialEndMinutes = block
    ? endMinutes(block)
    : (Math.min(1440, (defaultStart ?? 9 * 60) + 60) % MINUTES_PER_DAY);
  const [endDate, setEndDate] = useState(initialEndDate);
  const [endText, setEndText] = useState(
    minutesToHHMM(initialEndMinutes)
  );
  const [category, setCategory] = useState<Category>(block?.category ?? "work");
  const [location, setLocation] = useState(block?.location ?? "");
  const [taskId, setTaskId] = useState(block?.taskId ?? "");
  const [taskIdTouched, setTaskIdTouched] = useState(false);
  const [done, setDone] = useState(block?.done ?? false);
  const [obsidianVault, setObsidianVault] = useState(initialObsidianVault);
  const [obsidianNote, setObsidianNote] = useState(initialObsidianNote);
  const [obsidianLink, setObsidianLink] = useState(
    initialObsidianVault
      ? buildObsidianUrl(initialObsidianVault, initialObsidianNote)
      : ""
  );
  const [remindAt, setRemindAt] = useState(
    initialRemindInput ||
      remindBeforeInput(block?.date ?? defaultDate, initialStartMinutes)
  );
  const [remindTouched, setRemindTouched] = useState(false);
  const hasCustomReminder = Boolean(initialRemindInput);

  const syncDefaultReminder = (nextDate: string, nextStartMinutes: number) => {
    if (remindTouched || hasCustomReminder) return;
    setRemindAt(remindBeforeInput(nextDate, nextStartMinutes));
  };

  const handleStartDateChange = (value: string) => {
    setDate(value);
    if (!block || endDate === (block?.date ?? defaultDate)) {
      setEndDate(value);
    }
    syncDefaultReminder(value, timeToMinutes(startText));
  };

  const handleObsidianLinkChange = (value: string) => {
    setObsidianLink(value);
    const parsed = parseObsidianUrl(value);
    if (parsed.vault) setObsidianVault(parsed.vault);
    if (parsed.file) setObsidianNote(parsed.file);
  };

  const handleSave = () => {
    let start = timeToMinutes(startText);
    let end = timeToMinutes(endText);
    let dayDiff = Math.round(
      (parseDateKey(endDate).getTime() - parseDateKey(date).getTime()) / 86400000
    );
    if (dayDiff < 0) dayDiff = 0;
    let endOffset = dayDiff * MINUTES_PER_DAY + end;
    if (endOffset <= start) {
      endOffset = dayDiff === 0 ? MINUTES_PER_DAY + end : start + 15;
    }
    const noteRaw = obsidianNote.trim();
    const noteParsed = parseObsidianUrl(noteRaw);
    const resolvedVault = noteParsed.vault || obsidianVault.trim() || undefined;
    const resolvedNote = noteParsed.file || noteRaw || undefined;
    onSave(
      {
        name: name.trim() || "未命名事项",
        date,
        start,
        end: endOffset,
        category,
        location: location.trim() || undefined,
        subtaskId: block?.subtaskId,
        taskId: taskId || undefined,
        syncTask: !taskIdTouched,
        obsidianVault: resolvedVault,
        obsidianNote: resolvedNote,
        remindAt: remindAt ? new Date(remindAt).toISOString() : undefined,
        done,
        status: "scheduled",
      },
      block?.id
    );
    onClose();
  };

  const inputClass =
    "input-rect";
  const labelClass = "field-label";

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="modal-backdrop"
      onMouseDown={onClose}
    >
      <div
        className="modal-card modal-card-scroll max-w-lg"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <h3 className="modal-title">
            {block ? "编辑时间块" : "新建时间块"}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="icon-btn-plain"
            aria-label="关闭"
          >
            <X size={16} />
          </button>
        </div>

        <form
          className="modal-body space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            handleSave();
          }}
        >
          {block?.status === "pending" && (
            <div className="status-note-amber">
              这是一个待排期时间块，设置起止时间后会自动进入周计划。
            </div>
          )}

          <div>
            <label className={labelClass}>事项</label>
            <div className="flex items-center gap-2">
              <Tag size={15} className="shrink-0 text-ink-muted-48" />
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
              <label className={labelClass}>开始日期</label>
              <input
                type="date"
                className={inputClass}
                value={date}
                onChange={(event) => handleStartDateChange(event.target.value)}
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
                <Clock size={15} className="shrink-0 text-ink-muted-48" />
                <input
                  type="time"
                  className={inputClass}
                  value={startText}
                  onChange={(event) => {
                    const value = event.target.value;
                    setStartText(value);
                    syncDefaultReminder(date, timeToMinutes(value));
                  }}
                />
              </div>
            </div>
            <div>
              <label className={labelClass}>结束时间</label>
              <div className="flex items-center gap-2">
                <Clock size={15} className="shrink-0 text-ink-muted-48" />
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
              <label className={labelClass}>结束日期</label>
              <input
                type="date"
                className={inputClass}
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
              />
            </div>
            <div>
              <label className={labelClass}>地点</label>
              <div className="flex items-center gap-2">
                <MapPin size={15} className="shrink-0 text-ink-muted-48" />
                <input
                  className={inputClass}
                  value={location}
                  onChange={(event) => setLocation(event.target.value)}
                  placeholder="例如：深圳湾"
                />
              </div>
            </div>
          </div>

          <div>
            <label className={labelClass}>关联任务</label>
            <select
              className={inputClass}
              value={taskId}
              onChange={(event) => {
                setTaskId(event.target.value);
                setTaskIdTouched(true);
              }}
            >
              <option value="">不关联</option>
              {tasks.map((task) => (
                <option key={task.id} value={task.id}>
                  {task.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="field-hint">
              <BookMarked size={13} />
              <span>Obsidian 关联</span>
            </div>
            <div className="mb-4">
              <div className="field-hint">
                <Clock size={13} />
                <span>微信提醒</span>
              </div>
              <input
                type="datetime-local"
                className={inputClass}
                value={remindAt}
                onChange={(event) => {
                  setRemindAt(event.target.value);
                  setRemindTouched(true);
                }}
              />
              <p className="mt-1 text-[11px] text-ink-muted-48">
                默认开始前 5 分钟提醒，留空则不提醒
              </p>
            </div>
            <div className="mb-4">
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

          <label className="checkbox-control">
            <input
              type="checkbox"
              checked={done}
              onChange={(event) => setDone(event.target.checked)}
            />
            标记为完成
          </label>
          <div className="modal-footer !mt-0">
            {block ? (
              <button
                type="button"
                onClick={() => {
                  onDelete(block.id);
                  onClose();
                }}
                className="btn-ghost !border-[rgba(190,40,60,0.3)] !text-[#b3261e] hover:!bg-[rgba(190,40,60,0.06)]"
              >
                <Trash2 size={14} />
                删除
              </button>
            ) : (
              <span />
            )}
            <button
              type="submit"
              className="btn-primary-pill"
            >
              保存
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
