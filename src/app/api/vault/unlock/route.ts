import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { unlockVault } from '@/lib/vault';
import { handleRouteError, readJsonBody, jsonError } from '@/lib/api-response';
import { VAULT_FALLBACK_ERROR } from '@/lib/vault/http';

export async function POST(request: NextRequest) {
  try {
    const { password } = await readJsonBody<{ password?: string }>(request);
    if (!password || password.length < 8) {
      return jsonError('密码至少 8 位', 400);
    }
    const result = unlockVault(password);
    if (!result.ok) {
      return jsonError(
        result.error === 'corrupt' ? VAULT_FALLBACK_ERROR : '密码错误',
        result.error === 'corrupt' ? 500 : 401,
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleRouteError(err, VAULT_FALLBACK_ERROR);
  }
}
