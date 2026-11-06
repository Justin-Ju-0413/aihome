import { NextRequest, NextResponse } from 'next/server';
import { ensureFvInit } from '@/lib/fv/init';
import { applyTemplate } from '@/lib/fv/templates';
import { handleRouteError } from '@/lib/api-response';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  ensureFvInit();
  const { id } = await params;
  try {
    const body = await request.json().catch(() => ({}));
    const result = applyTemplate(id, body.variables || {});
    return NextResponse.json(result);
  } catch (err) {
    return handleRouteError(err, 'Failed to apply template');
  }
}
