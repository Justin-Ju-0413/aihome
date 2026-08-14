import { NextResponse } from 'next/server';
import { Registry } from '@/lib/registry/registry';
import { runDoctor } from '@/lib/registry/doctor';
import { assertWritable } from '@/lib/readonly';

export async function POST() {
  const reg = new Registry();
  try {
    await assertWritable();
    reg.open();
    const issues = runDoctor(reg, { fix: true });
    return NextResponse.json({ issues });
  } catch (error) {
    console.error('Registry doctor fix error:', error);
    return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Request failed' },
        { status: (error as { status?: number }).status ?? 500 }
      );
  } finally {
    reg.close();
  }
}
