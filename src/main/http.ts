/** 统一的网络超时：避免网络不可达（如客户机无法直连 GitHub）时请求长期挂起。 */
export const DEFAULT_TIMEOUT_MS = 8000

/**
 * 带超时的 fetch。超时后以 AbortError 拒绝，调用方按普通失败处理即可。
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<Response> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: ctrl.signal })
  } finally {
    clearTimeout(timer)
  }
}
