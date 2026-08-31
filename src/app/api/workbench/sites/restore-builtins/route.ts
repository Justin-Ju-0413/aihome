import { NextResponse } from 'next/server';
import { seedBuiltins } from '@/lib/workbench/seed';

export async function POST() {
  return NextResponse.json({ added: seedBuiltins() });
}
