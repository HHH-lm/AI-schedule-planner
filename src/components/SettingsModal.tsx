"use client";

import { useState } from "react";
import { BookMarked, X } from "lucide-react";
import { parseObsidianUrl } from "@/lib/obsidian";

interface Props {
  obsidianVault: string;
  onSave: (obsidianVault: string) => void;
  onClose: () => void;
}

export default function SettingsModal({
  obsidianVault: initialVault,
  onSave,
  onClose,
}: Props) {
  const [vault, setVault] = useState(initialVault);

  const handleSave = () => {
    const parsed = parseObsidianUrl(vault);
    onSave((parsed.vault ?? vault).trim());
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
        className="w-full max-w-md rounded-lg bg-white shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h3 className="text-sm font-semibold">设置</h3>
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
            <div className="mb-1 flex items-center gap-1.5">
              <BookMarked size={13} className="text-slate-400" />
              <span className={labelClass}>Obsidian 知识库</span>
            </div>
            <input
              className={inputClass}
              value={vault}
              onChange={(event) => {
                const parsed = parseObsidianUrl(event.target.value);
                setVault(parsed.vault ?? event.target.value);
              }}
              placeholder="知识库名称，或粘贴 Obsidian 链接"
            />
          </div>
        </div>

        <div className="flex items-center justify-end border-t border-slate-200 px-4 py-3">
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
