import { NextRequest, NextResponse } from 'next/server';
import { ensureFvInit } from '@/lib/fv/init';
import { listTemplates, listTemplatesByCategory, createTemplate, getTemplate } from '@/lib/fv/templates';
import { handleRouteError, jsonError, readJsonBody } from '@/lib/api-response';

export async function GET(request: NextRequest) {
  ensureFvInit();
  const { searchParams } = new URL(request.url);
  const category = searchParams.get('category');
  return NextResponse.json(category ? listTemplatesByCategory(category) : listTemplates());
}

export async function POST(request: NextRequest) {
  ensureFvInit();
  try {
    const body = await readJsonBody<{ name?: string; provider?: string; description?: string; prompt?: string; steps?: string[]; variables?: string[]; category?: string }>(request);
    const { name, provider, description, prompt, steps, variables, category } = body;
    if (!name || !provider) return jsonError('name and provider required', 400);
    const id = createTemplate({ name, provider, description, prompt, steps, variables, category });
    return NextResponse.json({ id, template: getTemplate(id) });
  } catch (err) {
    return handleRouteError(err, 'Failed to create template');
  }
}
