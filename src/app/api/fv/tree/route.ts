import { NextRequest, NextResponse } from 'next/server';
import { ensureFvInit } from '@/lib/fv/init';
import { scanDirectory } from '@/lib/fv/file-scanner';
import { ensureWatcher } from '@/lib/fv/file-watcher';
import { getValues } from '@/lib/fv/settings';

/** 文件树扫描（首次请求时惰性启动 chokidar 监听） */
export async function GET(request: NextRequest) {
  ensureFvInit();
  const { searchParams } = new URL(request.url);
  const defaultDir = getValues()['workspace.default_dir'] || process.cwd();
  const dir = searchParams.get('dir') || defaultDir;
  const tree = scanDirectory(dir);
  ensureWatcher(defaultDir);
  return NextResponse.json({ root: dir, tree });
}
