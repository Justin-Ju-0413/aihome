import { NextResponse } from 'next/server';
import { Registry } from '@/lib/registry/registry';
import { runDoctor } from '@/lib/registry/doctor';

export async function POST() {
  try {
    const reg = new Registry();
    reg.open();
    const issues = runDoctor(reg, { fix: true });
    reg.close();
    return NextResponse.json({ issues });
  } catch (error) {
    console.error('Registry doctor fix error:', error);
    return NextResponse.json({ error: 'Failed to fix' }, { status: 500 });
  }
}
