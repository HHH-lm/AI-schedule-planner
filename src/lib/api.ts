export const API_TIMEOUT_MS = 15_000;

// 本地开发默认直连后端，绕过 Next rewrite 的逐请求开销（后端 CORS 已放行 localhost:3000）；
// NEXT_PUBLIC_BACKEND_URL 可覆盖（自定义 BACKEND_PORT / 部署形态）；生产留空走相对路径由 rewrite 代理。
const API_BASE =
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  (process.env.NODE_ENV === "development" ? "http://127.0.0.1:8000" : "");

export async function apiPost<T>(
  path: string,
  body: unknown,
  timeoutMs = API_TIMEOUT_MS
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}/api/v1${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify(body),
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError")
    ) {
      throw new Error(`后端服务超时（${Math.round(timeoutMs / 1000)} 秒），请稍后重试`);
    }
    throw new Error("无法连接后端服务，请确认 FastAPI 后端已启动");
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `后端服务返回 ${response.status}${detail ? `：${detail.slice(0, 120)}` : ""}`
    );
  }
  return (await response.json()) as T;
}
