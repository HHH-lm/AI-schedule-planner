export const API_TIMEOUT_MS = 15_000;

export async function apiPost<T>(
  path: string,
  body: unknown,
  timeoutMs = API_TIMEOUT_MS
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/v1${path}`, {
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
