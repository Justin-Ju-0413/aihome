import { NextResponse } from 'next/server';
import { queryKeyBalance } from '@/lib/workbench/service';

export async function POST(_req: Request, { params }: { params: Promise<{ keyId: string }> }) {
  const { keyId } = await params;
  const result = await queryKeyBalance(Number(keyId));
  return NextResponse.json({ result });
}
