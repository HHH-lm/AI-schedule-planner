"use client";

import { Eye, X } from "lucide-react";
import { addDays, parseDateKey } from "@/lib/date";

interface Props {
  hiddenWeeks: string[];
  onRestore: (weekKey: string) => void;
  onClose: () => void;
}

export default function RestoreWeeksModal({
  hiddenWeeks,
  onRestore,
  onClose,
}: Props) {
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className="modal-card max-w-md"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <h3 className="modal-title">恢复隐藏周</h3>
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
          <p className="text-[15px] leading-relaxed text-ink-muted-80">
            以下周只在任务看板中隐藏，数据仍然保留。恢复后即可在看板中重新显示。
          </p>
          {hiddenWeeks.map((weekKey) => {
            const start = parseDateKey(weekKey);
            const end = addDays(start, 6);
            return (
              <div
                key={weekKey}
                className="flex items-center justify-between gap-3 rounded-lg border border-[var(--hairline)] px-3 py-2.5"
              >
                <span className="text-sm font-medium text-ink">
                  {start.getMonth() + 1}/{start.getDate()} - {end.getMonth() + 1}/
                  {end.getDate()}
                </span>
                <button
                  type="button"
                  onClick={() => onRestore(weekKey)}
                  className="btn-secondary-pill !py-1.5 text-xs"
                >
                  <Eye size={12} />
                  恢复显示
                </button>
              </div>
            );
          })}
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
