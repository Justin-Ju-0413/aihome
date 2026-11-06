import { NextResponse } from 'next/server';
import { Registry } from '@/lib/registry/registry';
import { runDoctor } from '@/lib/registry/doctor';
import { assertWritable } from '@/lib/readonly';
import { handleRouteError } from '@/lib/api-response';

export async function POST() {
  const reg = new Registry();
  try {
    await assertWritable();
    reg.open();
    const issues = runDoctor(reg, { fix: true });
    return NextResponse.json({ issues });
  } catch (err) {
    return handleRouteError(err, 'Request failed');
  } finally {
    reg.close();
  }
}
