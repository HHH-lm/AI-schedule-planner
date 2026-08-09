"use client";

import { useState } from "react";
import { CheckCircle2, Circle, Plus, Trash2, X } from "lucide-react";
import type { Subtask, Task } from "@/lib/types";
import { uid } from "@/lib/storage";

interface Props {
  task: Task | null;
  defaultDate: string;
  onSave: (draft: Partial<Task>, id?: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

export default function TaskModal({
  task,
  defaultDate,
  onSave,
  onDelete,
  onClose,
}: Props) {
  const [name, setName] = useState(task?.name ?? "");
  const [date, setDate] = useState(task?.date ?? "");
  const [status, setStatus] = useState(task?.status ?? "todo");
  const [subtasks, setSubtasks] = useState<Subtask[]>(task?.subtasks ?? []);
  const [subtaskName, setSubtaskName] = useState("");

  const addSubtask = () => {
    const value = subtaskName.trim();
    if (!value) return;
    setSubtasks((prev) => [...prev, { id: uid(), name: value, done: false }]);
    setSubtaskName("");
  };

  const handleSave = () => {
    onSave(
      {
        name: name.trim() || "未命名任务",
        date: date || null,
        status,
        subtasks,
      },
      task?.id
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
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white shadow-2xl thin-scroll"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h3 className="text-sm font-semibold">
            {task ? "任务详情" : "新建任务"}
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
          <div>
            <label className={labelClass}>任务名称</label>
            <input
              className={inputClass}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="例如：做一期视频"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>排期日期</label>
              <input
                type="date"
                className={inputClass}
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </div>
            <div>
              <label className={labelClass}>状态</label>
              <button
                type="button"
                onClick={() =>
                  setStatus((value) => (value === "done" ? "todo" : "done"))
                }
                className={`flex w-full items-center justify-between rounded-md border px-2.5 py-1.5 text-sm ${
                  status === "done"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-slate-300 bg-white text-slate-700"
                }`}
              >
                <span>{status === "done" ? "已完成" : "进行中"}</span>
                {status === "done" ? (
                  <CheckCircle2 size={15} className="text-emerald-600" />
                ) : (
                  <Circle size={15} className="text-slate-300" />
                )}
              </button>
            </div>
          </div>

          <div>
            <label className={labelClass}>子任务清单</label>
            <div className="space-y-1.5">
              {subtasks.map((subtask) => (
                <div
                  key={subtask.id}
                  className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5"
                >
                  <button
                    type="button"
                    onClick={() =>
                      setSubtasks((prev) =>
                        prev.map((item) =>
                          item.id === subtask.id
                            ? { ...item, done: !item.done }
                            : item
                        )
                      )
                    }
                    className="shrink-0"
                  >
                    {subtask.done ? (
                      <CheckCircle2 size={15} className="text-emerald-600" />
                    ) : (
                      <Circle size={15} className="text-slate-300" />
                    )}
                  </button>
                  <input
                    className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                    value={subtask.name}
                    onChange={(event) =>
                      setSubtasks((prev) =>
                        prev.map((item) =>
                          item.id === subtask.id
                            ? { ...item, name: event.target.value }
                            : item
                        )
                      )
                    }
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setSubtasks((prev) =>
                        prev.filter((item) => item.id !== subtask.id)
                      )
                    }
                    className="shrink-0 rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-rose-600"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              <input
                className={inputClass}
                value={subtaskName}
                onChange={(event) => setSubtaskName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addSubtask();
                  }
                }}
                placeholder="添加子任务，如：拍摄 B-roll"
              />
              <button
                type="button"
                onClick={addSubtask}
                className="inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-300 px-3 text-sm text-slate-700 hover:bg-slate-50"
              >
                <Plus size={14} />
                添加
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3">
          {task ? (
            <button
              type="button"
              onClick={() => {
                onDelete(task.id);
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
