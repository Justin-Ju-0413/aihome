import { NextResponse } from 'next/server';
import { refreshAllBalances } from '@/lib/workbench/service';

export async function POST() {
  const summary = await refreshAllBalances();
  return NextResponse.json({ summary });
}
