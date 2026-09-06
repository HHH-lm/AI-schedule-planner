import {
  isPlanningStyleId,
  normalizePlanningWeights,
} from "./planningWeights";
import { migrateSettings } from "./settings";
import type { AppData, AppSettings } from "./types";

/**
 * AppData 结构版本（localStorage 与 Supabase `schedule_state.data` 共用）。
 * 发生破坏性字段变更时 +1，并在 migrateAppData 的迁移链中追加对应步骤。
 */
export const APP_DATA_SCHEMA_VERSION = 2;

/** 无版本号的存量包与早期 makeSampleData 写死的 version:1 均按 v1 处理 */
const LEGACY_SCHEMA_VERSION = 1;

/** v1 → v2：规划权重七维收敛为六维后的存量归一 */
function migrateV1ToV2(data: AppData): AppData {
  if (!data.settings) return { ...data, version: APP_DATA_SCHEMA_VERSION };
  const settings: AppSettings = { ...migrateSettings(data.settings) };
  if (settings.planningWeights) {
    // 旧七维数据的 deadline 键在此剥离，缺失维度回退默认并归一到总和 1
    settings.planningWeights = normalizePlanningWeights(
      settings.planningWeights
    );
  }
  if (!isPlanningStyleId(settings.planningStyle)) {
    delete settings.planningStyle;
  }
  return { ...data, settings, version: APP_DATA_SCHEMA_VERSION };
}

/**
 * 读端统一迁移入口：结构校验 + 按版本逐级升级，返回带当前版本号的 AppData。
 * 结构不合法返回 null（沿用 loadLocalData 旧语义，由上层回退样本/远程数据）；
 * 高于当前版本的数据原样返回（容忍新数据被旧代码打开）。
 */
export function migrateAppData(raw: unknown): AppData | null {
  if (typeof raw !== "object" || raw === null) return null;
  const record = raw as Record<string, unknown>;
  if (!Array.isArray(record.tasks) || !Array.isArray(record.timeBlocks)) {
    return null;
  }
  const rawVersion = record.version;
  const version =
    typeof rawVersion === "number" && Number.isInteger(rawVersion)
      ? rawVersion
      : LEGACY_SCHEMA_VERSION;
  if (version >= APP_DATA_SCHEMA_VERSION) return raw as AppData;

  let data = raw as AppData;
  // 迁移链：v1 → v2；未来破坏性变更在此按版本边界逐级追加
  if (version <= 1) data = migrateV1ToV2(data);
  return { ...data, version: APP_DATA_SCHEMA_VERSION };
}
