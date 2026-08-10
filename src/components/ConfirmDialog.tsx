"use client";

import { useState } from "react";
import { X } from "lucide-react";

interface Props {
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}

export default function ConfirmDialog({
  title,
  description,
  confirmLabel,
  onConfirm,
  onClose,
}: Props) {
  const [submitting, setSubmitting] = useState(false);

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      await onConfirm();
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className="modal-card max-w-sm"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <h3 className="modal-title">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="icon-btn-plain"
            aria-label="关闭"
            disabled={submitting}
          >
            <X size={16} />
          </button>
        </div>

        <div className="modal-body">
          <p className="text-[15px] leading-relaxed text-ink-muted-80">
            {description}
          </p>
        </div>

        <div className="modal-footer !justify-end">
          <button
            type="button"
            onClick={onClose}
            className="btn-secondary-pill"
            disabled={submitting}
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="btn-primary-pill"
            disabled={submitting}
          >
            {submitting ? "退出中..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
