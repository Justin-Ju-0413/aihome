import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { lockVault } from '@/lib/vault';
import { handleRouteError } from '@/lib/api-response';
import { VAULT_FALLBACK_ERROR } from '@/lib/vault/http';

export async function POST(_request: NextRequest) {
  try {
    lockVault();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleRouteError(err, VAULT_FALLBACK_ERROR);
  }
}
