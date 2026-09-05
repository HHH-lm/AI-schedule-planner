import type { AiProviderSetting, AppSettings } from "./types";

/**
 * 旧数据（含 "auto"）与非法值统一归一为 "local"：
 * auto 已下线，未迁移用户落到最安全的本地规则。
 */
export function normalizeAiProvider(value: unknown): AiProviderSetting {
  return value === "openai" || value === "deepseek" ? value : "local";
}

/** 存量 AppData 设置迁移：aiProvider 含 "auto" 时归一（Key 字段原样保留） */
export function migrateSettings(settings: AppSettings | undefined): AppSettings | undefined {
  if (!settings) return settings;
  if (settings.aiProvider === undefined) return settings;
  const normalized = normalizeAiProvider(settings.aiProvider);
  if (normalized === settings.aiProvider) return settings;
  return { ...settings, aiProvider: normalized };
}

/** 当前 provider 对应的用户自备 Key（trim 后为空视为未填） */
export function aiApiKeyFor(
  provider: AiProviderSetting,
  settings: AppSettings | undefined
): string | undefined {
  const key =
    provider === "openai"
      ? settings?.openaiApiKey
      : provider === "deepseek"
        ? settings?.deepseekApiKey
        : undefined;
  const trimmed = key?.trim();
  return trimmed ? trimmed : undefined;
}

/** 保存前校验：选择了 AI 服务商但未填对应 Key 时返回错误文案，可保存时返回 null */
export function aiSettingError(
  provider: AiProviderSetting,
  openaiKey: string | undefined,
  deepseekKey: string | undefined
): string | null {
  if (provider === "local") return null;
  const key = provider === "openai" ? openaiKey : deepseekKey;
  if (key?.trim()) return null;
  const label = provider === "openai" ? "OpenAI" : "DeepSeek";
  return `已选择 ${label}，请填入对应的 API Key，或改选「本地规则」`;
}

/**
 * 组装发往 AI 端点的请求字段。provider 原样传递（不擅自改 local）——
 * 未填 Key 时由后端统一降级本地并在 message 中提示原因。
 */
export function aiRequestFields(
  settings: AppSettings | undefined
): { provider: AiProviderSetting; api_key?: string } {
  const provider = normalizeAiProvider(settings?.aiProvider);
  const api_key = aiApiKeyFor(provider, settings);
  return api_key ? { provider, api_key } : { provider };
}
