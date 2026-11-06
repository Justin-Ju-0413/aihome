import { NextResponse } from 'next/server';
import type { VaultResult } from './index';

/** vault 读损坏/会话异常的统一 500 文案(各路由共享,e2e 依赖该文案)。 */
export const VAULT_FALLBACK_ERROR = 'vault 文件损坏或密码错误';

/** 把编排层判别联合直接映射为 HTTP 响应(错误文案与状态码由 result 决定)。 */
export function vaultResultResponse<P>(result: VaultResult<P>, pick: 'ok' | 'provider' = 'ok'): NextResponse {
  if (result.ok) {
    return NextResponse.json(pick === 'provider' ? { provider: result.provider } : { ok: true });
  }
  const body: { error: string; conflictDetail?: string } = { error: result.error };
  if (result.conflictDetail !== undefined) body.conflictDetail = result.conflictDetail;
  return NextResponse.json(body, { status: result.status });
}
