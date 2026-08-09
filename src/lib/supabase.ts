import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AppData } from "./types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const envUserId = process.env.NEXT_PUBLIC_SUPABASE_USER_ID;

export interface SupabaseScope {
  enabled: boolean;
  userId: string;
}

/**
 * 云同步采用单用户边界：必须显式配置用户 ID 才启用同步，
 * 避免多人部署时全部实例共用同一行数据。
 */
export function resolveSupabaseScope(
  supabaseUrl: string | undefined,
  supabaseAnonKey: string | undefined,
  userId: string | undefined
): SupabaseScope {
  if (!supabaseUrl || !supabaseAnonKey || !userId) {
    return { enabled: false, userId: "" };
  }
  return { enabled: true, userId };
}

const scope = resolveSupabaseScope(url, anonKey, envUserId);

let client: SupabaseClient | null = null;
if (scope.enabled) {
  client = createClient(url!, anonKey!);
}

export function isSupabaseConfigured(): boolean {
  return scope.enabled;
}

export function getSupabaseUserId(): string {
  return scope.userId;
}

export async function loadRemoteData(): Promise<AppData | null> {
  if (!client || !scope.enabled) return null;
  try {
    const { data, error } = await client
      .from("schedule_state")
      .select("data")
      .eq("user_id", scope.userId)
      .eq("id", "singleton")
      .maybeSingle();
    if (error || !data) return null;
    return (data as { data: AppData }).data ?? null;
  } catch {
    return null;
  }
}

export async function saveRemoteData(data: AppData): Promise<void> {
  if (!client || !scope.enabled) return;
  try {
    await client.from("schedule_state").upsert(
      {
        user_id: scope.userId,
        id: "singleton",
        data,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,id" }
    );
  } catch {
    // 网络异常时保留本地副本，下次写入重试
  }
}
