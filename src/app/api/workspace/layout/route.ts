import { NextRequest, NextResponse } from 'next/server';
import { getLayout, saveLayout, type AgentLayout } from '@/lib/workspace-config';
import { assertWritable } from '@/lib/readonly';
import { handleRouteError, readJsonBody } from '@/lib/api-response';

export async function GET() {
  try {
    const layout = await getLayout();
    return NextResponse.json(layout);
  } catch (err) {
    return handleRouteError(err, 'Request failed');
  }
}

export async function PUT(request: NextRequest) {
  try {
    await assertWritable();
    const layout = await readJsonBody<AgentLayout>(request);
    await saveLayout(layout);
    return NextResponse.json({ success: true });
  } catch (err) {
    return handleRouteError(err, 'Request failed');
  }
}
