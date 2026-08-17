"use client";

import { AlertCircle, X } from "lucide-react";
import type { ParsedSchedule } from "@/lib/types";
import { parseDateKey, weekdayName } from "@/lib/date";
import { formatBlockRange } from "@/lib/blockTime";

interface Props {
  conflicts: ParsedSchedule[];
  onClose: () => void;
}

function conflictLabel(item: ParsedSchedule): string {
  const date = parseDateKey(item.date);
  return `${weekdayName(date)} ${date.getMonth() + 1}/${date.getDate()} ${formatBlockRange(item)}`;
}

export default function ConflictModal({ conflicts, onClose }: Props) {
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className="modal-card max-w-md"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <h3 className="modal-title">时间冲突</h3>
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
          <div className="flex items-start gap-2 text-[15px] leading-relaxed text-ink-muted-80">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span>
              以下时间段已有安排，本次没有重复添加。修改已有时间块后可以再次生成。
            </span>
          </div>

          <div className="divide-y divide-[var(--divider-soft)] overflow-hidden rounded-lg border border-[var(--hairline)]">
            {conflicts.map((item, index) => (
              <div
                key={`${item.date}-${item.start}-${item.end}-${index}`}
                className="flex flex-col gap-1 px-3 py-2.5"
              >
                <div className="text-xs font-semibold text-ink-muted-80">
                  {conflictLabel(item)}
                </div>
                <div className="text-sm text-ink">{item.name}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="modal-footer !justify-end">
          <button type="button" onClick={onClose} className="btn-primary-pill">
            知道了
          </button>
        </div>
      </div>
    </div>
  );
}
