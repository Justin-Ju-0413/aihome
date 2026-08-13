import { initBuiltinTemplates } from './templates';
import { initDefaults } from './settings';
import { recoverStaleAgents } from './process-registry';

/**
 * FileVision 运行时一次性初始化：内置模板 + 设置默认值 + 崩溃恢复。
 * 在首个 /api/fv/* 请求时调用；globalThis guard 防止 Next dev HMR 重复执行。
 */
const GLOBAL_KEY = '__fvInitDone__';

export function ensureFvInit(): void {
  const g = globalThis as Record<string, unknown>;
  if (g[GLOBAL_KEY]) return;
  g[GLOBAL_KEY] = true;
  initBuiltinTemplates();
  initDefaults();
  const recovered = recoverStaleAgents();
  if (recovered > 0) console.log(`[fv] recovered ${recovered} stale agents from previous crash`);
}
