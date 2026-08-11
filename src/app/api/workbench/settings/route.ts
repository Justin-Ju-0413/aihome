import { NextResponse } from 'next/server';
import { getSettings, updateSettings } from '@/lib/workbench/crud';
import { ensureAutoRefresh } from '@/lib/workbench/scheduler';

export async function GET() {
  return NextResponse.json({ settings: getSettings() });
}

export async function PUT(req: Request) {
  const body = await req.json().catch(() => ({}));
  const settings = updateSettings({
    autoRefreshEnabled: typeof body?.autoRefreshEnabled === 'boolean' ? body.autoRefreshEnabled : undefined,
    refreshIntervalMin: typeof body?.refreshIntervalMin === 'number' ? body.refreshIntervalMin : undefined,
  });
  ensureAutoRefresh();
  return NextResponse.json({ settings });
}
