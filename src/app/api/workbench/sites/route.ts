import { NextResponse } from 'next/server';
import { listSites, createSite, getCurrentKeyRecord } from '@/lib/workbench/crud';
import { seedBuiltins } from '@/lib/workbench/seed';
import type { Site, SiteInput } from '@/lib/workbench/types';

function withCurrentKey(site: Site) {
  const key = getCurrentKeyRecord(site.id);
  return {
    ...site,
    currentKey: key
      ? {
          id: key.id,
          label: key.label,
          provider: key.provider,
          isCurrent: key.isCurrent,
          lastCheckStatus: key.lastCheckStatus,
          lastBalanceJson: key.lastBalanceJson,
          lastCheckAt: key.lastCheckAt,
        }
      : null,
  };
}

export async function GET() {
  // 首启：站点表为空时写入内置清单（幂等，仅空表时执行）
  if (listSites().length === 0) seedBuiltins();
  return NextResponse.json({ sites: listSites().map(withCurrentKey) });
}

export async function POST(req: Request) {
  let body: SiteInput;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '无效的 JSON' }, { status: 400 });
  }
  if (!body?.name || !body?.url) return NextResponse.json({ error: 'name 和 url 必填' }, { status: 400 });
  try {
    const site = createSite(body);
    return NextResponse.json({ site }, { status: 201 });
  } catch (error) {
    console.error('Failed to create site:', error);
    return NextResponse.json({ error: 'Failed to create site' }, { status: 400 });
  }
}
