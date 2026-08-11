import { NextRequest, NextResponse } from 'next/server';
import { ensureFvInit } from '@/lib/fv/init';
import { listEvents } from '@/lib/fv/events';

/** 事件流轮询：返回 seq > cursor 的增量事件 */
export async function GET(request: NextRequest) {
  ensureFvInit();
  const { searchParams } = new URL(request.url);
  const cursor = parseInt(searchParams.get('cursor') || '0') || 0;
  return NextResponse.json(listEvents(cursor));
}
