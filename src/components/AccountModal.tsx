"use client";

import { LogOut, User, X } from "lucide-react";

interface Props {
  email: string;
  onLogout: () => void;
  onClose: () => void;
}

export default function AccountModal({ email, onLogout, onClose }: Props) {
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className="modal-card max-w-sm"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <h3 className="modal-title">账号</h3>
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
          <div className="flex items-center gap-3">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#e8edf3]">
              <User size={22} className="text-ink-muted-48" />
            </div>
            <div className="min-w-0">
              <div className="text-[15px] font-semibold text-ink">
                {email || "已登录账号"}
              </div>
              <div className="text-xs text-ink-muted-48">
                已登录云同步，数据将保存到云端
              </div>
            </div>
          </div>
        </div>

        <div className="modal-footer !justify-end">
          <button
            type="button"
            onClick={onLogout}
            className="btn-primary-pill"
          >
            <LogOut size={14} />
            退出登录
          </button>
        </div>
      </div>
    </div>
  );
}
