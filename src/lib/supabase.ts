import {
  createClient,
  type AuthChangeEvent,
  type Session,
  type SupabaseClient,
} from "@supabase/supabase-js";
import type { AppData } from "./types";
import { logError, logInfo, logWarn } from "./logger";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let client: SupabaseClient | null = null;
if (url && anonKey) {
  client = createClient(url, anonKey);
}

export function isSupabaseConfigured(): boolean {
  return Boolean(client);
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function mapAuthErrorMessage(
  error: { message: string } | null
): string | null {
  if (!error) return null;
  const message = error.message;
  if (/invalid login credentials/i.test(message)) return "邮箱或密码不正确";
  if (/already registered/i.test(message)) return "该邮箱已注册";
  if (/at least 6 characters/i.test(message)) return "密码至少需要 6 位";
  if (/invalid format/i.test(message)) return "邮箱格式不正确";
  if (/email not confirmed/i.test(message)) return "邮箱尚未确认，请先查收确认邮件";
  return "操作失败，请稍后重试";
}

export interface AuthResult {
  error: string | null;
  requiresEmailConfirmation?: boolean;
}

export async function signInWithPassword(
  email: string,
  password: string
): Promise<AuthResult> {
  if (!client) return { error: "云同步未配置" };
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    logWarn("auth_sign_in_failed", { code: error.code ?? "unknown" });
    return { error: mapAuthErrorMessage(error) };
  }
  logInfo("auth_signed_in");
  return { error: null };
}

export async function signUp(
  email: string,
  password: string
): Promise<AuthResult> {
  if (!client) return { error: "云同步未配置" };
  const { data, error } = await client.auth.signUp({ email, password });
  if (error) {
    logWarn("auth_sign_up_failed", { code: error.code ?? "unknown" });
    return { error: mapAuthErrorMessage(error) };
  }
  logInfo("auth_signed_up");
  return {
    error: null,
    requiresEmailConfirmation: Boolean(data?.user && !data.session),
  };
}

export async function signOutUser(): Promise<void> {
  if (!client) return;
  try {
    await client.auth.signOut();
    logInfo("auth_signed_out");
  } catch {
    logError("auth_sign_out_failed");
  }
}

export async function getSession(): Promise<{
  data: { session: Session | null };
}> {
  if (!client) return { data: { session: null } };
  const { data } = await client.auth.getSession();
  return { data };
}

export function onAuthStateChange(
  callback: (event: AuthChangeEvent, session: Session | null) => void
): { unsubscribe: () => void } {
  if (!client) return { unsubscribe: () => undefined };
  const { data } = client.auth.onAuthStateChange(callback);
  return { unsubscribe: () => data.subscription.unsubscribe() };
}

async function getActiveUserId(): Promise<string | null> {
  if (!client) return null;
  const { data } = await client.auth.getSession();
  return data.session?.user.id ?? null;
}

export async function loadRemoteData(): Promise<AppData | null> {
  const userId = await getActiveUserId();
  if (!client || !userId) return null;
  try {
    const { data, error } = await client
      .from("schedule_state")
      .select("data")
      .eq("user_id", userId)
      .eq("id", "singleton")
      .maybeSingle();
    if (error || !data) return null;
    return (data as { data: AppData }).data ?? null;
  } catch {
    logError("supabase_load_failed", { userId });
    return null;
  }
}

export async function saveRemoteData(data: AppData): Promise<void> {
  const userId = await getActiveUserId();
  if (!client || !userId) return;
  try {
    await client.from("schedule_state").upsert(
      {
        user_id: userId,
        id: "singleton",
        data,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,id" }
    );
  } catch {
    logError("supabase_save_failed", { userId });
    // 网络异常时保留本地副本，下次写入重试
  }
}
