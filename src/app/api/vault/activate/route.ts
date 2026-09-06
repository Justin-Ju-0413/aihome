import type { NextRequest } from 'next/server';
import { activateTool } from '@/lib/vault';
import { touchSession, type ToolId } from '@/lib/vault/store';
import { handleRouteError, readJsonBody, jsonError } from '@/lib/api-response';
import { vaultResultResponse, VAULT_FALLBACK_ERROR } from '@/lib/vault/http';

const TOOLS: ToolId[] = ['claude-code', 'codex', 'opencode'];

export async function POST(request: NextRequest) {
  try {
    touchSession();
    const { tool, providerId } = await readJsonBody<{ tool?: string; providerId?: string }>(request);
    if (!tool || !TOOLS.includes(tool as ToolId)) {
      return jsonError('unknown tool', 400);
    }
    return vaultResultResponse(activateTool(tool as ToolId, providerId ?? ''));
  } catch (err) {
    return handleRouteError(err, VAULT_FALLBACK_ERROR);
  }
}
