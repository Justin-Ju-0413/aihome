import { NextRequest, NextResponse } from 'next/server';
import { ensureFvInit } from '@/lib/fv/init';
import { listTemplates, listTemplatesByCategory, createTemplate, getTemplate } from '@/lib/fv/templates';

export async function GET(request: NextRequest) {
  ensureFvInit();
  const { searchParams } = new URL(request.url);
  const category = searchParams.get('category');
  return NextResponse.json(category ? listTemplatesByCategory(category) : listTemplates());
}

export async function POST(request: NextRequest) {
  ensureFvInit();
  try {
    const body = await request.json();
    const { name, provider, description, prompt, steps, variables, category } = body;
    if (!name || !provider) return NextResponse.json({ error: 'name and provider required' }, { status: 400 });
    const id = createTemplate({ name, provider, description, prompt, steps, variables, category });
    return NextResponse.json({ id, template: getTemplate(id) });
  } catch (err) {
    console.error('Failed to create template:', err);
    return NextResponse.json({ error: 'Failed to create template' }, { status: 500 });
  }
}
