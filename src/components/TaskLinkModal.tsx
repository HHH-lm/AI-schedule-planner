"use client";

import { Link2, Plus, X } from "lucide-react";
import type { Task } from "@/lib/types";
import { formatDeadlineLabel, isDeadlineOverdue } from "@/lib/deadline";

interface Props {
  blockName: string;
  deadline: string;
  tasks: Task[];
  onPick: (taskId: string) => void;
  onCreate: () => void;
  onClose: () => void;
}

/**
 * 自然语言含截止表述但未匹配到任务时的引导弹窗：
 * 选择已有任务（保存截止日期并回链时间块）或新建任务（预填截止日期）。
 */
export default function TaskLinkModal({
  blockName,
  deadline,
  tasks,
  onPick,
  onCreate,
  onClose,
}: Props) {
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className="modal-card modal-card-scroll max-w-md thin-scroll"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <h3 className="modal-title">选择任务以保存截止日期</h3>
          <button
            type="button"
            onClick={onClose}
            className="icon-btn-plain"
            aria-label="关闭"
          >
            <X size={16} />
          </button>
        </div>

        <div className="modal-body space-y-3">
          <p className="text-sm leading-relaxed text-ink-muted-80">
            「{blockName}」未匹配到已有任务。检测到截止日期{" "}
            <span
              className={`font-semibold ${
                isDeadlineOverdue(deadline) ? "text-[#b3261e]" : "text-primary"
              }`}
            >
              {formatDeadlineLabel(deadline)}
            </span>
            ，请选择要关联的任务，或新建任务。
          </p>

          <div className="max-h-56 space-y-1.5 overflow-y-auto thin-scroll">
            {tasks.length === 0 ? (
              <div className="rounded-[8px] border border-hairline bg-surface-pearl px-3 py-4 text-center text-xs text-ink-muted-48">
                暂无任务，可直接新建
              </div>
            ) : (
              tasks.map((task) => (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => onPick(task.id)}
                  className="flex w-full items-center gap-2 rounded-[8px] border border-hairline bg-surface-pearl px-3 py-2 text-left transition hover:bg-canvas-parchment"
                >
                  <Link2 size={14} className="shrink-0 text-primary" />
                  <span className="min-w-0 flex-1 truncate text-sm text-ink">
                    {task.name}
                  </span>
                  {task.subtasks.some((sub) => sub.name === blockName) ? (
                    <span className="shrink-0 text-[11px] text-primary">
      已含同名子任务
                    </span>
                  ) : null}
                </button>
              ))
            )}
          </div>
        </div>

        <div className="modal-footer !justify-between">
          <button type="button" onClick={onClose} className="btn-ghost">
            稍后再说
          </button>
          <button type="button" onClick={onCreate} className="btn-primary-pill">
            <Plus size={14} />
            新建任务
          </button>
        </div>
      </div>
    </div>
  );
}
