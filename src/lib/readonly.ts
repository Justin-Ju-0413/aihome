import { getWorkspaceConfig } from './workspace-config';

/**
 * 只读演示模式：config.readonly === true 或 AIHOME_READONLY=1（env 优先）。
 * 写 API 在 handler 开头调用 assertWritable()，只读时抛 403。
 */
export async function assertWritable(): Promise<void> {
  const readOnly =
    process.env.AIHOME_READONLY === '1' || (await getWorkspaceConfig()).readonly === true;
  if (readOnly) {
    const e = new Error('Read-only mode: workspace writes are disabled');
    (e as { status?: number }).status = 403;
    throw e;
  }
}
