import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * 统一 API 错误契约。
 *
 * 规则（全站一致）：
 * - 成功响应保持各路由既有形状，不强制包壳。
 * - 错误响应一律 `{ error: string, code?: string }` + 明确的 HTTP 状态码。
 * - 业务校验失败用 HttpError(status, message)（如 400/403/404），
 *   未预期异常交给 handleRouteError 兜底为 500。
 */

export class HttpError extends Error {
  readonly status: number;
  readonly code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
  }
}

/** 统一错误响应体。 */
export function jsonError(message: string, status = 400, code?: string): NextResponse {
  return NextResponse.json(
    code ? { error: message, code } : { error: message },
    { status },
  );
}

/** 读 JSON body；解析失败抛 HttpError(400)，供业务层统一 handleRouteError。 */
export async function readJsonBody<T = unknown>(request: NextRequest): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new HttpError(400, '无效的 JSON');
  }
}

/**
 * 兜底错误出口：
 * - HttpError → 按其自身 status/message/code 返回；
 * - 其他异常 → 记录日志并以 fallback 文案返回 fallbackStatus（默认 500）。
 */
export function handleRouteError(
  err: unknown,
  fallback: string,
  fallbackStatus = 500,
): NextResponse {
  if (err instanceof HttpError) {
    return jsonError(err.message, err.status, err.code);
  }
  console.error(`[api] ${fallback}:`, err);
  return jsonError(fallback, fallbackStatus);
}
