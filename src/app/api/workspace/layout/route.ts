import { NextRequest, NextResponse } from 'next/server';
import { getLayout, saveLayout, type AgentLayout } from '@/lib/workspace-config';

export async function GET() {
  try {
    const layout = await getLayout();
    return NextResponse.json(layout);
  } catch (error) {
    console.error('Failed to read layout:', error);
    return NextResponse.json(
      { error: 'Failed to read layout' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const layout = (await request.json()) as AgentLayout;
    await saveLayout(layout);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to save layout:', error);
    return NextResponse.json(
      { error: 'Failed to save layout' },
      { status: 500 }
    );
  }
}
