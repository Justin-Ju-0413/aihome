import { NextRequest, NextResponse } from 'next/server';
import { getRelations, saveRelations } from '@/lib/workspace-config';
import type { AgentRelation } from '@/lib/types';
import { assertWritable } from '@/lib/readonly';
import { handleRouteError, readJsonBody } from '@/lib/api-response';

export async function GET() {
  try {
    const relations = await getRelations();
    return NextResponse.json(relations);
  } catch (err) {
    return handleRouteError(err, 'Request failed');
  }
}

export async function PUT(request: NextRequest) {
  try {
    await assertWritable();
    const relations = await readJsonBody<AgentRelation[]>(request);
    await saveRelations(relations);
    return NextResponse.json({ success: true });
  } catch (err) {
    return handleRouteError(err, 'Request failed');
  }
}
