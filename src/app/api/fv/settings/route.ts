import { NextRequest, NextResponse } from 'next/server';
import { ensureFvInit } from '@/lib/fv/init';
import { listAll, listByCategory } from '@/lib/fv/settings';

export async function GET(request: NextRequest) {
  ensureFvInit();
  const { searchParams } = new URL(request.url);
  const category = searchParams.get('category');
  return NextResponse.json(category ? listByCategory(category) : listAll());
}
