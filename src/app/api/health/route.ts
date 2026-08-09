import { NextResponse } from "next/server";
import pkg from "../../../../package.json";
import { isSupabaseConfigured } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({
    status: "ok",
    service: pkg.name,
    version: pkg.version,
    storage: isSupabaseConfigured() ? "supabase" : "local",
    timestamp: new Date().toISOString(),
  });
}
