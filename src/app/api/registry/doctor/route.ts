import { NextResponse } from 'next/server';
import { Registry } from '@/lib/registry/registry';
import { runDoctor } from '@/lib/registry/doctor';
import { handleRouteError } from '@/lib/api-response';

export async function GET() {
  const reg = new Registry();
  try {
    reg.open();
    const issues = runDoctor(reg);
    return NextResponse.json({ issues });
  } catch (err) {
    return handleRouteError(err, 'Failed to run doctor');
  } finally {
    reg.close();
  }
}
