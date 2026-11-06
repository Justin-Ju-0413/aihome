import type { NextRequest } from 'next/server';
import { changeVaultPassword } from '@/lib/vault';
import { touchSession } from '@/lib/vault/store';
import { handleRouteError, readJsonBody, jsonError } from '@/lib/api-response';
import { VAULT_FALLBACK_ERROR } from '@/lib/vault/http';
import { NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    touchSession();
    const { oldPassword, newPassword } = await readJsonBody<{ oldPassword?: string; newPassword?: string }>(request);
    if (!newPassword || newPassword.length < 8) {
      return jsonError('密码至少 8 位', 400);
    }
    const result = changeVaultPassword(oldPassword ?? '', newPassword);
    if (!result.ok) {
      return jsonError(result.error ?? '旧密码错误', 401);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleRouteError(err, VAULT_FALLBACK_ERROR);
  }
}
