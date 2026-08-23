"use client";

import { useState } from "react";
import { BookMarked, Bot, Brain, SlidersHorizontal, X } from "lucide-react";
import { parseObsidianUrl } from "@/lib/obsidian";
import type { AiProviderSetting, PlanningWeights } from "@/lib/types";
import {
  DEFAULT_PLANNING_WEIGHTS,
  PLANNING_WEIGHT_DIMENSIONS,
  clampWeight,
  normalizePlanningWeights,
} from "@/lib/planningWeights";

interface Props {
  obsidianVault: string;
  aiProvider: AiProviderSetting;
  planningWeights: PlanningWeights;
  onSave: (settings: {
    obsidianVault: string;
    aiProvider: AiProviderSetting;
    planningWeights: PlanningWeights;
  }) => void;
  onClose: () => void;
  onOpenMemory?: () => void;
}

export default function SettingsModal({
  obsidianVault: initialVault,
  aiProvider: initialProvider,
  planningWeights: initialWeights,
  onSave,
  onClose,
  onOpenMemory,
}: Props) {
  const [vault, setVault] = useState(initialVault);
  const [provider, setProvider] = useState<AiProviderSetting>(initialProvider);
  const [weights, setWeights] = useState<PlanningWeights>(() =>
    normalizePlanningWeights(initialWeights)
  );

  const handleSave = () => {
    const parsed = parseObsidianUrl(vault);
    onSave({
      obsidianVault: (parsed.vault ?? vault).trim(),
      aiProvider: provider,
      planningWeights: normalizePlanningWeights(weights),
    });
    onClose();
  };

  const inputClass = "input-rect";
  const updateWeight = (key: keyof PlanningWeights, value: number) => {
    setWeights((prev) => ({ ...prev, [key]: clampWeight(value) }));
  };

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

          <hr className="border-t border-[var(--border-subtle)]" />

          <div>
            <div className="field-hint">
              <Brain size={13} />
              <span>记忆系统</span>
            </div>
            <p className="text-xs text-ink-muted-48 mb-2">
              管理那些会长期影响 AI 规划的习惯、偏好和约束
            </p>
            <button
              type="button"
              onClick={onOpenMemory}
              className="btn-ghost"
            >
              <Brain size={14} />
              管理记忆
            </button>
          </div>

          <hr className="border-t border-[var(--border-subtle)]" />

          <div>
            <div className="field-hint">
              <SlidersHorizontal size={13} />
              <span>个性化规划</span>
            </div>
            <div className="space-y-3">
              {PLANNING_WEIGHT_DIMENSIONS.map((dimension) => (
                <div key={dimension.key} className="flex items-center gap-3">
                  <span className="w-16 shrink-0 text-sm text-ink-muted-80">
                    {dimension.label}
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={weights[dimension.key]}
                    onChange={(event) =>
                      updateWeight(dimension.key, Number(event.target.value))
                    }
                    className="min-w-0 flex-1"
                    style={{ accentColor: "var(--primary)" }}
                    aria-label={`${dimension.label}权重`}
                  />
                  <input
                    type="number"
                    min={0}
                    max={1}
                    step={0.05}
                    value={weights[dimension.key]}
                    onChange={(event) =>
                      updateWeight(dimension.key, Number(event.target.value))
                    }
                    className="input-rect !w-20 !px-2 !py-1.5 text-right text-sm"
                    aria-label={`${dimension.label}权重数值`}
                  />
                </div>
              ))}
            </div>
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
