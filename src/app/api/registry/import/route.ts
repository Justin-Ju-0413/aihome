import { NextRequest, NextResponse } from 'next/server';
import { Registry } from '@/lib/registry/registry';
import { importSkill } from '@/lib/registry/sync-engine';
import { assertWritable } from '@/lib/readonly';
import { handleRouteError, jsonError, readJsonBody } from '@/lib/api-response';

export async function POST(req: NextRequest) {
  const reg = new Registry();
  try {
    await assertWritable();
    const body = await readJsonBody<{ name?: string; sourcePath?: string }>(req);
    if (!body?.name || !body?.sourcePath) {
      return jsonError('name and sourcePath required', 400);
    }
    reg.open();
    const result = importSkill(reg, { name: body.name, sourcePath: body.sourcePath });
    return NextResponse.json(result);
  } catch (err) {
    return handleRouteError(err, 'Request failed');
  } finally {
    reg.close();
  }
}
