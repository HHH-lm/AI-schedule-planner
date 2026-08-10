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
    "input-rect";
  const labelClass = "field-label";

  return (
    <div
      className="modal-backdrop"
      onMouseDown={onClose}
    >
      <div
        className="modal-card modal-card-scroll max-w-lg thin-scroll"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <h3 className="modal-title">
            {task ? "任务详情" : "新建任务"}
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

        <div className="modal-body space-y-4">
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
                    ? "status-note-ok"
                    : "btn-ghost w-full"
                }`}
              >
                <span>{status === "done" ? "已完成" : "进行中"}</span>
                {status === "done" ? (
                  <CheckCircle2 size={15} className="text-[#146b46]" />
                ) : (
                  <Circle size={15} className="text-ink-muted-48" />
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
                  className="flex items-center gap-2 rounded-[8px] border border-hairline bg-surface-pearl px-2 py-1.5"
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
                      <CheckCircle2 size={15} className="text-primary" />
                    ) : (
                      <Circle size={15} className="text-ink-muted-48" />
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
                    className="icon-btn-plain !h-7 !w-7 hover:!text-[#b3261e]"
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
                className="btn-ghost shrink-0"
              >
                <Plus size={14} />
                添加
              </button>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          {task ? (
            <button
              type="button"
              onClick={() => {
                onDelete(task.id);
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
            type="button"
            onClick={handleSave}
            className="btn-primary-pill"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
