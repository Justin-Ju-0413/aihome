import { NextResponse } from 'next/server';
import { clearAllKeys } from '@/lib/workbench/crud';

export async function POST() {
  return NextResponse.json({ cleared: clearAllKeys() });
}
