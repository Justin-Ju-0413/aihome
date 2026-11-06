import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getStatus } from '@/lib/vault';
import { handleRouteError } from '@/lib/api-response';
import { VAULT_FALLBACK_ERROR } from '@/lib/vault/http';

export async function GET(_request: NextRequest) {
  try {
    return NextResponse.json(getStatus());
  } catch (err) {
    return handleRouteError(err, VAULT_FALLBACK_ERROR);
  }
}
