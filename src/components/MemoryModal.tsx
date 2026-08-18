"use client";

import { useState } from "react";
import {
  Check,
  Clock,
  Dumbbell,
  Heart,
  Lightbulb,
  Pencil,
  Plus,
  Power,
  PowerOff,
  Shield,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import type {
  AIMemorySuggestion,
  Memory,
  MemoryCategory,
} from "@/lib/types";
import { uid } from "@/lib/storage";
import ConfirmDialog from "@/components/ConfirmDialog";

const CATEGORY_ORDER: MemoryCategory[] = [
  "time-preference",
  "habit",
  "life-preference",
  "long-term-constraint",
];

const CATEGORY_META: Record<
  MemoryCategory,
  { label: string; icon: typeof Clock }
> = {
  "time-preference": { label: "时间偏好", icon: Clock },
  habit: { label: "习惯", icon: Dumbbell },
  "life-preference": { label: "生活/工作偏好", icon: Heart },
  "long-term-constraint": { label: "长期约束", icon: Shield },
};

interface Props {
  memories: Memory[];
  suggestions: AIMemorySuggestion[];
  onSave: (memory: Memory) => void;
  onDelete: (id: string) => void;
  onAcceptSuggestion: (suggestion: AIMemorySuggestion) => void;
  onDismissSuggestion: (id: string) => void;
  onRunAnalysis?: () => Promise<void>;
  isAnalyzing?: boolean;
  onClose: () => void;
}

export default function MemoryModal({
  memories,
  suggestions,
  onSave,
  onDelete,
  onAcceptSuggestion,
  onDismissSuggestion,
  onRunAnalysis,
  isAnalyzing,
  onClose,
}: Props) {
  const [addingCategory, setAddingCategory] = useState<MemoryCategory | null>(
    null
  );
  const [newContent, setNewContent] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [showArchived, setShowArchived] = useState(true);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const activeCount = memories.filter((m) => m.status !== "archived").length;
  const archivedCount = memories.length - activeCount;

  const handleAdd = (category: MemoryCategory) => {
    const content = newContent.trim();
    if (!content) return;
    const now = new Date().toISOString();
    const memory: Memory = {
      id: uid(),
      category,
      content,
      createdAt: now,
      updatedAt: now,
      source: "manual",
      status: "active",
    };
    onSave(memory);
    setNewContent("");
    setAddingCategory(null);
  };

  const handleEdit = (memory: Memory) => {
    setEditingId(memory.id);
    setEditContent(memory.content);
  };

  const handleSaveEdit = () => {
    const content = editContent.trim();
    if (!content || !editingId) return;
    const existing = memories.find((m) => m.id === editingId);
    if (!existing) return;
    onSave({
      ...existing,
      content,
      updatedAt: new Date().toISOString(),
    });
    setEditingId(null);
    setEditContent("");
  };

  const handleToggleArchived = (memory: Memory) => {
    onSave({
      ...memory,
      status: memory.status === "archived" ? "active" : "archived",
      updatedAt: new Date().toISOString(),
    });
  };

  const handleCancelAdd = () => {
    setAddingCategory(null);
    setNewContent("");
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditContent("");
  };

  const inputClass = "input-rect";

  const renderMemoryCard = (memory: Memory) => {
    const isEditing = editingId === memory.id;
    const isActive = memory.status !== "archived";

    return (
      <div
        key={memory.id}
        className={`rounded-lg p-3 transition-opacity ${
          !isActive ? "opacity-50" : "bg-[var(--bg-muted)]"
        }`}
      >
        {isEditing ? (
          <div className="space-y-2">
            <textarea
              className={inputClass + " min-h-[60px]"}
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={handleCancelEdit}
                className="btn-ghost !h-7 !text-xs"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                className="btn-primary-pill !h-7 !text-xs"
                disabled={!editContent.trim()}
              >
                保存
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2 min-w-0">
<div className="min-w-0 pl-[8px]">
                <p
                  className={`text-xs leading-relaxed whitespace-pre-wrap ${
                    !isActive ? "line-through text-ink-muted-30" : ""
                  }`}
                >
                  {memory.content}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  {memory.source === "manual" && (
                    <span className="text-[11px] text-ink-muted-48">来源：手动添加</span>
                  )}
                  {memory.source === "ai-suggested" && (
                    <span className="text-[11px] text-ink-muted-48">来源：智能生成</span>
                  )}
                  {!isActive && (
                    <span className="text-[11px] text-ink-muted-30">
                      已归档
                    </span>
                  )}
                  <span className="text-[11px] text-ink-muted-30">
                    {new Date(memory.updatedAt).toLocaleDateString("zh-CN")}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex gap-1 shrink-0">
              <button
                type="button"
                onClick={() => handleToggleArchived(memory)}
                className={`icon-btn-plain ${
                  isActive ? "text-green-600" : "text-ink-muted-30"
                }`}
                title={isActive ? "归档" : "恢复"}
                aria-label={isActive ? "归档此记忆" : "恢复此记忆"}
              >
                {isActive ? <Power size={13} /> : <PowerOff size={13} />}
              </button>
              <button
                type="button"
                onClick={() => handleEdit(memory)}
                className="icon-btn-plain"
                aria-label="编辑"
              >
                <Pencil size={13} />
              </button>
              <button
                type="button"
                onClick={() => setDeleteConfirmId(memory.id)}
                className="icon-btn-plain text-[#b3261e]"
                aria-label="删除"
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className="modal-card modal-card-scroll max-w-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <h3 className="modal-title">
            记忆系统
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

        <div className="modal-body">
          {/* AI Suggestions section */}
          <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Lightbulb size={14} className="text-amber-500" />
                  <span className="text-xs font-medium text-amber-700">
                    候选记忆
                  </span>
                  {suggestions.length > 0 && (
                    <span className="text-[11px] text-amber-500 bg-amber-50 px-1.5 py-0.5 rounded-full">
                      {suggestions.length} 条待处理
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={onRunAnalysis}
                  disabled={isAnalyzing}
                  className="btn-ghost !h-7 !text-xs"
                >
                  <Sparkles size={12} className={isAnalyzing ? "animate-spin" : ""} />
                  {isAnalyzing ? "分析中..." : "智能分析"}
                </button>
              </div>
              {suggestions.length > 0 ? (
              <div className="space-y-2">
                {suggestions.map((suggestion) => (
                  <div
                    key={suggestion.id}
                    className="border border-amber-200 bg-amber-50/50 rounded-lg p-3"
                  >
                    <div className="flex items-start gap-2 mb-2">
                      <Lightbulb
                        size={14}
                        className="shrink-0 mt-0.5 text-amber-500"
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-medium leading-relaxed whitespace-pre-wrap text-amber-900">
                          {suggestion.conclusion || suggestion.content}
                        </p>
                        {suggestion.conclusion && suggestion.conclusion !== suggestion.content && (
                          <p className="text-[11px] text-ink-muted-48 leading-relaxed mt-1 whitespace-pre-wrap">
                            {suggestion.content}
                          </p>
                        )}
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[11px] text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
                            {CATEGORY_META[suggestion.category].label}
                          </span>
                          <span className="text-[11px] text-ink-muted-30">
                            {new Date(
                              suggestion.createdAt
                            ).toLocaleDateString("zh-CN")}
                          </span>
                        </div>
                      </div>
                    </div>

                    {suggestion.reasoning && (
                      <div className="mb-2 ml-6">
                        <p className="text-[11px] text-ink-muted-48 leading-relaxed">
                          <span className="font-medium">依据：</span>
                          {suggestion.reasoning}
                        </p>
                      </div>
                    )}

                    {/* Confidence bar */}
                    <div className="ml-6 mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-ink-muted-48 shrink-0">
                          置信度
                        </span>
                        <div className="flex-1 h-1.5 bg-amber-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-amber-500 rounded-full transition-all"
                            style={{
                              width: `${Math.round(
                                suggestion.confidence * 100
                              )}%`,
                            }}
                          />
                        </div>
                        <span className="text-[11px] font-medium text-amber-700 shrink-0 w-8 text-right">
                          {Math.round(suggestion.confidence * 100)}%
                        </span>
                      </div>
                    </div>

                    <div className="flex gap-2 ml-6">
                      <button
                        type="button"
                        onClick={() => onAcceptSuggestion(suggestion)}
                        className="btn-primary-pill !h-7 !text-xs !px-3"
                      >
                        <Check size={12} />
                        加入我的记忆
                      </button>
                      <button
                        type="button"
                        onClick={() => onDismissSuggestion(suggestion.id)}
                        className="btn-ghost !h-7 !text-xs !px-3"
                      >
                        <X size={12} />
                        忽略
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              ) : (
                <div className="py-6 text-center">
                  <Lightbulb size={24} className="mx-auto mb-1.5 text-ink-muted-30" />
                  <p className="text-xs text-ink-muted-48">
                    点击上方按钮，系统会根据你的过往数据生成记忆建议
                  </p>
                </div>
              )}
            </div>

          {/* Category sections */}
          <div className="space-y-5">
            {CATEGORY_ORDER.map((category) => {
              const meta = CATEGORY_META[category];
              const Icon = meta.icon;
              const categoryMemories = memories.filter(
                (m) => m.category === category
              );
              const displayMemories = showArchived
                ? categoryMemories
                : categoryMemories.filter((m) => m.status !== "archived");
              const isAdding = addingCategory === category;

              return (
                <div key={category}>
                  {/* Category header */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <Icon size={14} className="text-ink-muted-48" />
                      <span className="text-base font-semibold text-ink">
                        {meta.label}
                      </span>
                      <span className="text-[11px] text-ink-muted-30">
                        {categoryMemories.filter((m) => m.status !== "archived").length}
                        /{categoryMemories.length}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setAddingCategory(category);
                        setNewContent("");
                      }}
                      className="icon-btn-plain"
                      aria-label={`添加${meta.label}`}
                      title={`添加${meta.label}`}
                    >
                      <Plus size={15} />
                    </button>
                  </div>

                  {/* Add form */}
                  {isAdding && (
                    <div className="bg-[var(--bg-muted)] rounded-lg p-3 mb-2 space-y-2">
                      <textarea
                        className={inputClass + " min-h-[60px]"}
                        value={newContent}
                        onChange={(e) => setNewContent(e.target.value)}
                        placeholder={`例如：${category === "time-preference" ? "我上午的精力最好" : category === "habit" ? "每周运动两次" : category === "life-preference" ? "深度任务安排在上午" : "周末不安排工作"}`}
                        autoFocus
                      />
                      <div className="flex gap-2 justify-end">
                        <button
                          type="button"
                          onClick={handleCancelAdd}
                          className="btn-ghost !h-7 !text-xs"
                        >
                          取消
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAdd(category)}
                          className="btn-primary-pill !h-7 !text-xs"
                          disabled={!newContent.trim()}
                        >
                          保存
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Memory list */}
                  {displayMemories.length === 0 && !isAdding ? (
                    <p className="text-xs text-ink-muted-30 pl-1">
                      暂无记忆
                    </p>
                  ) : (
                    <div className="space-y-1">
                      {displayMemories.map((memory) =>
                        renderMemoryCard(memory)
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {deleteConfirmId && (
          <ConfirmDialog
            title="删除记忆"
            description="确定要删除这条记忆吗？删除后将无法用于未来的 AI 规划。"
            confirmLabel="删除"
            onConfirm={() => {
              onDelete(deleteConfirmId);
              setDeleteConfirmId(null);
            }}
            onClose={() => setDeleteConfirmId(null)}
          />
        )}

        <div className="modal-footer">
          <div className="flex items-center justify-between w-full">
            <span className="text-[11px] text-ink-muted-30">
              {memories.length} 条记忆 · {activeCount} 条启用 ·{" "}
              {archivedCount} 条已归档
              {suggestions.length > 0 && ` · ${suggestions.length} 条待处理建议`}
            </span>
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <span className="text-[11px] text-ink-muted-48">
                {archivedCount > 0
                  ? `${archivedCount} 条已归档`
                  : "显示已归档"}
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={showArchived}
                onClick={() => setShowArchived(!showArchived)}
                className={`relative inline-flex h-4 w-7 shrink-0 rounded-full border transition-colors ${
                  showArchived
                    ? "border-primary bg-primary"
                    : "border-[var(--border-default)] bg-[var(--bg-surface)]"
                }`}
              >
                <span
                  className={`inline-block h-3 w-3 translate-y-[1px] rounded-full bg-white shadow-sm transition-transform ${
                    showArchived ? "translate-x-[13px]" : "translate-x-[1px]"
                  }`}
                />
              </button>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
