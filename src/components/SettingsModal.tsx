"use client";

import { useState } from "react";
import { BookMarked, Bot, X } from "lucide-react";
import { parseObsidianUrl } from "@/lib/obsidian";
import type { AiProviderSetting } from "@/lib/types";

interface Props {
  obsidianVault: string;
  aiProvider: AiProviderSetting;
  onSave: (settings: {
    obsidianVault: string;
    aiProvider: AiProviderSetting;
  }) => void;
  onClose: () => void;
}

export default function SettingsModal({
  obsidianVault: initialVault,
  aiProvider: initialProvider,
  onSave,
  onClose,
}: Props) {
  const [vault, setVault] = useState(initialVault);
  const [provider, setProvider] = useState<AiProviderSetting>(initialProvider);

  const handleSave = () => {
    const parsed = parseObsidianUrl(vault);
    onSave({
      obsidianVault: (parsed.vault ?? vault).trim(),
      aiProvider: provider,
    });
    onClose();
  };

  const inputClass = "input-rect";

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className="modal-card max-w-md"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <h3 className="modal-title">设置</h3>
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
            <div className="field-hint">
              <BookMarked size={13} />
              <span>Obsidian 知识库</span>
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

          <div>
            <div className="field-hint">
              <Bot size={13} />
              <span>AI 解析服务</span>
            </div>
            <select
              className={inputClass}
              value={provider}
              onChange={(event) =>
                setProvider(event.target.value as AiProviderSetting)
              }
            >
              <option value="auto">自动（优先 OpenAI，其次 DeepSeek）</option>
              <option value="openai">OpenAI</option>
              <option value="deepseek">DeepSeek</option>
              <option value="local">本地规则</option>
            </select>
          </div>
        </div>

        <div className="modal-footer !justify-end">
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
