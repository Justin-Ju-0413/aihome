import * as os from 'os';
import * as path from 'path';

/**
 * FileVision 运行时数据路径。
 * DB 放在用户级 ~/.aihome/ 下（与 usage-cache.db 同级），
 * 测试可通过 AIHOME_FV_DB 重定向到临时目录。
 */
export function fvDbPath(): string {
  return process.env.AIHOME_FV_DB ?? path.join(os.homedir(), '.aihome', 'filevision.db');
}

/**
 * 旧版 file-visualizer（Express 版）的 data.db，仅用于首次迁移。
 * 默认查找同级的 file-visualizer 项目目录，可用 AIHOME_FV_LEGACY_DB 覆盖。
 */
export function legacyFvDbPath(): string {
  return (
    process.env.AIHOME_FV_LEGACY_DB ??
    path.join(process.cwd(), '..', 'file-visualizer', 'data.db')
  );
}
