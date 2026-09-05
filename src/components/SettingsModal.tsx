"use client";

import { useEffect, useState } from "react";
import { Clock, BookMarked, Bot, Brain, SlidersHorizontal, X } from "lucide-react";
import { parseObsidianUrl } from "@/lib/obsidian";
import { aiSettingError } from "@/lib/settings";
import type {
  AiProviderSetting,
  PlanningDimensionKey,
  PlanningStyleId,
  PlanningWeights,
  TimePreference,
} from "@/lib/types";
import {
  DEFAULT_PLANNING_WEIGHTS,
  PLANNING_WEIGHT_DIMENSIONS,
  PLANNING_STYLE_PRESETS,
  applyPlanningFocus,
  describePlanningWeights,
  inferPlanningSelection,
  clampWeight,
  normalizePlanningWeights,
} from "@/lib/planningWeights";
import {
  DEFAULT_TIME_PREFERENCE,
  TIME_PREFERENCE_PRESETS,
  normalizeTimePreference,
} from "@/lib/timePreference";

interface Props {
  obsidianVault: string;
  aiProvider: AiProviderSetting;
  openaiApiKey?: string;
  deepseekApiKey?: string;
  planningWeights: PlanningWeights;
  planningStyle?: PlanningStyleId;
  planningFocus?: PlanningDimensionKey[];
  timePreference?: TimePreference;
  onSave: (settings: {
    obsidianVault: string;
    aiProvider: AiProviderSetting;
    openaiApiKey?: string;
    deepseekApiKey?: string;
    planningWeights: PlanningWeights;
    planningStyle?: PlanningStyleId;
    planningFocus?: PlanningDimensionKey[];
    timePreference: TimePreference;
  }) => void;
  onClose: () => void;
  onOpenMemory?: () => void;
}

export default function SettingsModal({
  obsidianVault: initialVault,
  aiProvider: initialProvider,
  openaiApiKey: initialOpenaiKey,
  deepseekApiKey: initialDeepseekKey,
  planningWeights: initialWeights,
  planningStyle: initialStyle,
  planningFocus: initialFocus,
  timePreference: initialTimePreference,
  onSave,
  onClose,
  onOpenMemory,
}: Props) {
  const [vault, setVault] = useState(initialVault);
  const [provider, setProvider] = useState<AiProviderSetting>(initialProvider);
  const [openaiKey, setOpenaiKey] = useState(initialOpenaiKey ?? "");
  const [deepseekKey, setDeepseekKey] = useState(initialDeepseekKey ?? "");
  const [weights, setWeights] = useState<PlanningWeights>(() =>
    normalizePlanningWeights(initialWeights)
  );
  // "截止优先"风格已移除：存量数据（旧 localStorage 可能仍存有该值）回退为按权重推断
  const storedStyle =
    (initialStyle as string | undefined) === "deadline" ? undefined : initialStyle;
  const [styleId, setStyleId] = useState<PlanningStyleId>(() =>
    storedStyle ??
    inferPlanningSelection(normalizePlanningWeights(initialWeights)).styleId
  );
  const [focus, setFocus] = useState<PlanningDimensionKey[]>(() =>
    (initialFocus ?? []).filter(
      (key, index) =>
        PLANNING_WEIGHT_DIMENSIONS.some((dimension) => dimension.key === key) &&
        index < 2
    )
  );
  const [advancedOpen, setAdvancedOpen] = useState(
    (storedStyle ?? inferPlanningSelection(weights).styleId) === "custom"
  );
  const [timePreference, setTimePreference] = useState<TimePreference>(() =>
    normalizeTimePreference(initialTimePreference ?? DEFAULT_TIME_PREFERENCE)
  );
  // 点击保存后才开始显示 Key 校验错误；填入 Key 或改选后提示自动消失
  const [saveAttempted, setSaveAttempted] = useState(false);
  const keyError = saveAttempted
    ? aiSettingError(provider, openaiKey, deepseekKey)
    : null;

  useEffect(() => {
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.overflow = previousBodyOverflow;
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const handleSave = () => {
    setSaveAttempted(true);
    if (aiSettingError(provider, openaiKey, deepseekKey)) return;
    const parsed = parseObsidianUrl(vault);
    onSave({
      obsidianVault: (parsed.vault ?? vault).trim(),
      aiProvider: provider,
      openaiApiKey: openaiKey.trim() || undefined,
      deepseekApiKey: deepseekKey.trim() || undefined,
      // 设置页联动已保证百分比总和为 100，直接保存 0-1 权重
      planningWeights: weights,
      planningStyle: styleId,
      planningFocus: focus.length > 0 ? focus : undefined,
      timePreference,
    });
    onClose();
  };

  const inputClass = "input-rect";
  // 设置页以整数百分比（0-100）展示，存储/后端仍为 0-1 浮点
  const selectStyle = (nextStyleId: PlanningStyleId) => {
    if (nextStyleId === "custom") return;
    setStyleId(nextStyleId);
    setFocus([]);
    setWeights(applyPlanningFocus(nextStyleId, []));
  };

  const toggleFocus = (key: PlanningDimensionKey) => {
    if (styleId === "custom") return;
    const nextFocus = focus.includes(key)
      ? focus.filter((item) => item !== key)
      : [...focus, key].slice(0, 2);
    setFocus(nextFocus);
    setWeights(applyPlanningFocus(styleId, nextFocus));
  };

  const resetToBalanced = () => {
    setStyleId("balanced");
    setFocus([]);
    setWeights(normalizePlanningWeights(DEFAULT_PLANNING_WEIGHTS));
    setAdvancedOpen(false);
  };

  const weightPercent = (key: PlanningDimensionKey) =>
    Math.round(weights[key] * 100);
  const updateWeightPercent = (
    key: PlanningDimensionKey,
    percent: number
  ) => {
    const clamped = Math.min(100, Math.max(0, Math.round(percent)));
    setWeights((prev) => {
      const current = Object.fromEntries(
        PLANNING_WEIGHT_DIMENSIONS.map((d) => [
          d.key,
          Math.round(prev[d.key] * 100),
        ])
      ) as Record<keyof PlanningWeights, number>;
      const oldValue = current[key];
      const delta = clamped - oldValue;
      if (delta === 0) return prev;
      const next = {
        ...current,
        [key]: clamped,
      } as Record<PlanningDimensionKey, number>;
      const others = PLANNING_WEIGHT_DIMENSIONS.filter((d) => d.key !== key);
      const othersTotal = others.reduce((sum, d) => sum + current[d.key], 0);
      const remaining = 100 - clamped;
      const sourceValues = othersTotal > 0
        ? others.map((d) => current[d.key])
        : others.map((d) => DEFAULT_PLANNING_WEIGHTS[d.key] * 100);
      const sourceTotal = sourceValues.reduce((a, b) => a + b, 0);

      if (remaining <= 0) {
        for (const d of others) next[d.key] = 0;
      } else if (sourceTotal <= 0) {
        const base = Math.floor(remaining / others.length);
        let allocated = 0;
        others.forEach((d, index) => {
          const share = index === others.length - 1
            ? remaining - allocated
            : base;
          next[d.key] = Math.max(0, share);
          allocated += share;
        });
      } else {
        let allocated = 0;
        others.forEach((d, index) => {
          const share = Math.round(
            (sourceValues[index] / sourceTotal) * remaining
          );
          next[d.key] = Math.max(0, Math.min(100, share));
          allocated += share;
        });
        const diff = remaining - allocated;
        if (diff !== 0) {
          const largest = [...others].sort(
            (a, b) => next[b.key] - next[a.key]
          )[0];
          next[largest.key] = Math.max(0, next[largest.key] + diff);
        }
      }

      const result = { ...prev };
      for (const d of PLANNING_WEIGHT_DIMENSIONS) {
        result[d.key] = clampWeight(next[d.key] / 100);
      }
      return result;
    });
    setStyleId("custom");
    setFocus([]);
    setAdvancedOpen(true);
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className="modal-card modal-card-scroll max-w-md"
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
              <option value="openai">OpenAI</option>
              <option value="deepseek">DeepSeek</option>
              <option value="local">本地规则</option>
            </select>
            {provider !== "local" && (
              <div className="mt-2">
                <input
                  type="password"
                  className={inputClass}
                  value={provider === "openai" ? openaiKey : deepseekKey}
                  onChange={(event) => {
                    if (provider === "openai") setOpenaiKey(event.target.value);
                    else setDeepseekKey(event.target.value);
                  }}
                  placeholder={`${provider === "openai" ? "OpenAI" : "DeepSeek"} API Key（sk- 开头）`}
                  autoComplete="off"
                />
                <p className="text-xs text-ink-muted-48 mt-1">
                  使用你自己的 API Key，仅保存在你的账号数据中；未填写时将使用本地规则解析。
                </p>
                {keyError && (
                  <p
                    className="text-xs mt-1"
                    style={{ color: "#b3261e" }}
                    role="alert"
                  >
                    {keyError}
                  </p>
                )}
              </div>
            )}
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
            <p className="text-xs text-ink-muted-48 mb-3">
              选择一个规划风格；如需强调，可再选最多两个重点。
            </p>

            <div className="grid grid-cols-2 gap-2">
              {PLANNING_STYLE_PRESETS.map((preset) => {
                const selected = styleId === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => selectStyle(preset.id)}
                    aria-pressed={selected}
                    className={`flex flex-col items-start justify-start rounded-xl border p-3 text-left transition ${
                      selected ? "shadow-sm" : ""
                    }`}
                    style={{
                      borderColor: selected
                        ? "var(--primary)"
                        : "var(--hairline)",
                      backgroundColor: selected
                        ? "color-mix(in srgb, var(--primary) 6%, transparent)"
                        : "transparent",
                    }}
                  >
                    <span className="block text-sm font-medium text-ink">
                      {preset.label}
                    </span>
                    <span className="mt-1 block text-xs leading-4 text-ink-muted-48">
                      {preset.description}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-4">
              <p className="text-sm font-medium text-ink-muted-80 mb-2">
                重点加强（最多 2 个）
              </p>
              <div className="flex flex-wrap gap-2">
                {PLANNING_WEIGHT_DIMENSIONS.map((dimension) => {
                  const selected = focus.includes(dimension.key);
                  return (
                    <button
                      key={dimension.key}
                      type="button"
                      onClick={() => toggleFocus(dimension.key)}
                      disabled={styleId === "custom"}
                      aria-pressed={selected}
                      className="rounded-full border px-3 py-1.5 text-xs transition disabled:cursor-not-allowed disabled:opacity-45"
                      style={{
                        borderColor: selected
                          ? "var(--primary)"
                          : "var(--hairline)",
                        backgroundColor: selected
                          ? "color-mix(in srgb, var(--primary) 8%, transparent)"
                          : "transparent",
                        color: selected
                          ? "var(--primary)"
                          : "var(--ink-muted-80)",
                      }}
                    >
                      {dimension.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-[var(--hairline)] bg-[var(--canvas)] p-3">
              <p className="text-xs text-ink-muted-80">
                {describePlanningWeights(weights)}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setAdvancedOpen(!advancedOpen)}
              aria-expanded={advancedOpen}
              className="mt-4 flex w-full items-center justify-between rounded-lg px-0 py-1 text-sm text-ink-muted-80"
            >
              <span>高级权重设置</span>
              <span>{advancedOpen ? "收起" : "展开"}</span>
            </button>

            {advancedOpen && (
              <div className="mt-3 space-y-3">
                <p className="text-xs leading-4 text-ink-muted-48">
                  高级模式下修改一项时，其余项会按比例重新分配，总和保持 100%。修改后会进入自定义状态。
                </p>
                <button
                  type="button"
                  onClick={resetToBalanced}
                  className="btn-ghost !px-3 !py-1.5 text-xs"
                >
                  恢复均衡默认
                </button>
                {PLANNING_WEIGHT_DIMENSIONS.map((dimension) => (
                  <div key={dimension.key} className="flex items-center gap-3">
                    <span className="w-16 shrink-0 text-sm text-ink-muted-80">
                      {dimension.label}
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={weightPercent(dimension.key)}
                      onChange={(event) =>
                        updateWeightPercent(
                          dimension.key,
                          Number(event.target.value)
                        )
                      }
                      className="min-w-0 flex-1"
                      style={{ accentColor: "var(--primary)" }}
                      aria-label={`${dimension.label}权重`}
                    />
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      value={weightPercent(dimension.key)}
                      onChange={(event) =>
                        updateWeightPercent(
                          dimension.key,
                          Number(event.target.value)
                        )
                      }
                      className="input-rect !w-20 !px-2 !py-1.5 text-center text-sm"
                      style={{ textAlign: "center" }}
                      aria-label={`${dimension.label}权重数值`}
                    />
                  </div>
                ))}
              </div>
            )}
            </div>

          <hr className="border-t border-[var(--border-subtle)]" />

          <div>
            <div className="field-hint">
              <Clock size={13} />
              <span>时段偏好</span>
            </div>
            <p className="text-xs text-ink-muted-48 mb-3">
              影响规划时对各时段的评分：夜猫型会把任务更多排到晚间，早起型则偏向清晨与上午。
            </p>
            <div className="grid grid-cols-3 gap-2">
              {TIME_PREFERENCE_PRESETS.map((preset) => {
                const selected = timePreference === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setTimePreference(preset.id)}
                    aria-pressed={selected}
                    className={`flex flex-col items-start justify-start rounded-xl border p-3 text-left transition ${
                      selected ? "shadow-sm" : ""
                    }`}
                    style={{
                      borderColor: selected
                        ? "var(--primary)"
                        : "var(--hairline)",
                      backgroundColor: selected
                        ? "color-mix(in srgb, var(--primary) 6%, transparent)"
                        : "transparent",
                    }}
                  >
                    <span className="block text-sm font-medium text-ink">
                      {preset.label}
                    </span>
                    <span className="mt-1 block text-xs leading-4 text-ink-muted-48">
                      {preset.description}
                    </span>
                  </button>
                );
              })}
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
