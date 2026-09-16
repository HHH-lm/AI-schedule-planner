export const API_TIMEOUT_MS = 15_000;

/**
 * 音频上传 + 识别的超时预算。
 * 必须显著大于后端的上游超时（ASR_TIMEOUT_MS，默认 30 秒）：两者相等时前端会与后端
 * 同时中止，抢走后端那条具体错误（如「识别服务繁忙」「录音过大」），用户只能看到
 * 笼统的超时提示。留出余量让后端的诊断文案先返回。
 */
export const UPLOAD_TIMEOUT_MS = 45_000;

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

/**
 * 从 FastAPI 错误响应中取出可读的 detail。
 * 形如 {"detail":"..."} 时只取字符串本身，避免把原始 JSON 甩给用户；
 * 422 校验错误的 detail 是数组，退化回截断文本。
 */
function extractDetail(raw: string): string {
  if (!raw) return "";
  try {
    const payload = JSON.parse(raw) as { detail?: unknown };
    const detail = payload?.detail;
    if (typeof detail === "string" && detail.trim()) return detail.trim();
  } catch {
    // 非 JSON，按原文本处理
  }
  return raw.slice(0, 120);
}

/**
 * multipart/form-data 上传（音频等二进制）。
 * apiPost 把 Content-Type 硬编码为 JSON 且会 JSON.stringify，无法用于文件上传，
 * 因此单独提供；FormData 由浏览器自动生成带 boundary 的 Content-Type，不要手写。
 */
export async function apiPostForm<T>(
  path: string,
  form: FormData,
  timeoutMs = UPLOAD_TIMEOUT_MS
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}/api/v1${path}`, {
      method: "POST",
      signal: AbortSignal.timeout(timeoutMs),
      body: form,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError")
    ) {
      throw new Error(`语音识别超时（${Math.round(timeoutMs / 1000)} 秒），请重试`);
    }
    throw new Error("无法连接后端服务，请确认 FastAPI 后端已启动");
  }
  if (!response.ok) {
    const detail = extractDetail(await response.text().catch(() => ""));
    throw new Error(
      detail || `语音识别失败（后端返回 ${response.status}）`
    );
  }
  return (await response.json()) as T;
}
