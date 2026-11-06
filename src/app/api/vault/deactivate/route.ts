import type { NextRequest } from 'next/server';
import { deactivateTool } from '@/lib/vault';
import { touchSession, type ToolId } from '@/lib/vault/store';
import { handleRouteError, readJsonBody, jsonError } from '@/lib/api-response';
import { vaultResultResponse, VAULT_FALLBACK_ERROR } from '@/lib/vault/http';

const TOOLS: ToolId[] = ['claude-code', 'codex', 'opencode'];

export async function POST(request: NextRequest) {
  try {
    touchSession();
    const { tool } = await readJsonBody<{ tool?: string }>(request);
    if (!tool || !TOOLS.includes(tool as ToolId)) {
      return jsonError('unknown tool', 400);
    }
    return vaultResultResponse(deactivateTool(tool as ToolId));
  } catch (err) {
    return handleRouteError(err, VAULT_FALLBACK_ERROR);
  }
}
