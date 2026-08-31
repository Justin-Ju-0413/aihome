import { NextResponse } from 'next/server';
import { Registry } from '@/lib/registry/registry';
import { runDoctor } from '@/lib/registry/doctor';

export async function GET() {
  const reg = new Registry();
  try {
    reg.open();
    const issues = runDoctor(reg);
    return NextResponse.json({ issues });
  } catch (error) {
    console.error('Registry doctor error:', error);
    return NextResponse.json({ error: 'Failed to run doctor' }, { status: 500 });
  } finally {
    reg.close();
  }
}
