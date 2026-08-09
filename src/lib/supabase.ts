import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AppData } from "./types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let client: SupabaseClient | null = null;
if (url && anonKey) {
  client = createClient(url, anonKey);
}

export function isSupabaseConfigured(): boolean {
  return Boolean(client);
}

export async function loadRemoteData(): Promise<AppData | null> {
  if (!client) return null;
  try {
    const { data, error } = await client
      .from("schedule_state")
      .select("data")
      .eq("id", "singleton")
      .maybeSingle();
    if (error || !data) return null;
    return (data as { data: AppData }).data ?? null;
  } catch {
    return null;
  }
}

export async function saveRemoteData(data: AppData): Promise<void> {
  if (!client) return;
  try {
    await client.from("schedule_state").upsert({
      id: "singleton",
      data,
      updated_at: new Date().toISOString(),
    });
  } catch {
    // 网络异常时保留本地副本，下次写入重试
  }
}
