import { NextResponse } from 'next/server';
import { Registry } from '@/lib/registry/registry';
import { removeSkillFromPlatform } from '@/lib/registry/sync-engine';

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const reg = new Registry();
    reg.open();
    const platforms = reg.listPlatforms().filter((p) => p.enabled === 1);
    const results = platforms.map((p) => removeSkillFromPlatform(reg, id, p.name));
    reg.deleteSkill(id);
    reg.close();
    return NextResponse.json({ results });
  } catch (error) {
    console.error('Registry delete error:', error);
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
  }
}
