import { NextRequest, NextResponse } from 'next/server';
import { getRelations, saveRelations } from '@/lib/workspace-config';
import type { AgentRelation } from '@/lib/types';
import { assertWritable } from '@/lib/readonly';

export async function GET() {
  try {
    const relations = await getRelations();
    return NextResponse.json(relations);
  } catch (error) {
    console.error('Failed to fetch relations:', error);
    return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Request failed' },
        { status: (error as { status?: number }).status ?? 500 }
      );
  }
}

export async function PUT(request: NextRequest) {
  try {
    await assertWritable();
    const relations: AgentRelation[] = await request.json();
    await saveRelations(relations);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to update relations:', error);
    return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Request failed' },
        { status: (error as { status?: number }).status ?? 500 }
      );
  }
}
