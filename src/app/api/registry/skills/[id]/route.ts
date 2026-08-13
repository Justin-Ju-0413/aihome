import { NextResponse } from 'next/server';
import { Registry } from '@/lib/registry/registry';
import { removeSkillFromPlatform } from '@/lib/registry/sync-engine';
import { assertWritable } from '@/lib/readonly';

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const reg = new Registry();
  try {
    await assertWritable();
    const { id } = await params;
    reg.open();
    const platforms = reg.listPlatforms().filter((p) => p.enabled === 1);
    const results = platforms.map((p) => removeSkillFromPlatform(reg, id, p.name));
    reg.deleteSkill(id);
    return NextResponse.json({ results });
  } catch (error) {
    console.error('Registry delete error:', error);
    return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Request failed' },
        { status: (error as { status?: number }).status ?? 500 }
      );
  } finally {
    reg.close();
  }
}
