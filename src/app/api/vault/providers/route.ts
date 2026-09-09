import type { NextRequest } from 'next/server';
import { upsertProvider } from '@/lib/vault';
import { touchSession } from '@/lib/vault/store';
import { handleRouteError, readJsonBody } from '@/lib/api-response';
import { vaultResultResponse, VAULT_FALLBACK_ERROR } from '@/lib/vault/http';

export async function POST(request: NextRequest) {
  try {
    touchSession();
    const body = await readJsonBody<{
      id?: string; name?: string; baseUrl?: string; model?: string; apiKey?: string;
    }>(request);
    const result = upsertProvider({
      id: body.id, name: body.name ?? '', baseUrl: body.baseUrl ?? '',
      model: body.model ?? '', apiKey: body.apiKey ?? '',
    });
    return vaultResultResponse(result, 'provider');
  } catch (err) {
    return handleRouteError(err, VAULT_FALLBACK_ERROR);
  }
}
