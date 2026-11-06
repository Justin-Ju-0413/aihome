import { NextRequest, NextResponse } from 'next/server';
import { ensureFvInit } from '@/lib/fv/init';
import { detectCompositeTasks } from '@/lib/fv/prompt-converter';
import { selectProvider, selectModel } from '@/lib/fv/scheduler';
import { convert } from '@/lib/fv/prompt-converter';
import { handleRouteError, jsonError, readJsonBody } from '@/lib/api-response';

export async function POST(request: NextRequest) {
  ensureFvInit();
  try {
    const body = await readJsonBody<{ task?: string; provider?: string; model?: string; target?: string; cwd?: string; skill?: string }>(request);
    const { task, provider, model, target, cwd, skill } = body;
    if (!task) return jsonError('task required', 400);
    const parts = detectCompositeTasks(task);
    if (!parts) return NextResponse.json({ composite: false, parts: null });
    const results = parts.map((p) => {
      const p2 = provider || selectProvider(p.task, { model, target, skill });
      const converted = convert(p.task, p2, { target, skill, cwd });
      const m = model || selectModel(p.task, p2);
      return { task: p.task, type: p.type, provider: p2, model: m, prompt: converted.prompt, taskLabel: converted.taskLabel, taskIcon: converted.taskIcon };
    });
    return NextResponse.json({ composite: true, parts: results });
  } catch (err) {
    return handleRouteError(err, 'Failed to detect composite tasks');
  }
}
