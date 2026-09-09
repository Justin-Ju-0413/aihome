import type { NextRequest } from 'next/server';
import { removeProvider } from '@/lib/vault';
import { touchSession } from '@/lib/vault/store';
import { handleRouteError } from '@/lib/api-response';
import { vaultResultResponse, VAULT_FALLBACK_ERROR } from '@/lib/vault/http';

export async function DELETE(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    touchSession();
    const { id } = await ctx.params;
    return vaultResultResponse(removeProvider(id));
  } catch (err) {
    return handleRouteError(err, VAULT_FALLBACK_ERROR);
  }
}
