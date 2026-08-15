import type { Page } from '@playwright/test';

/**
 * e2e 固定以中文界面运行:现有断言基于中文 UI 文案。
 * addInitScript 在页面脚本执行前注入 localStorage,确保 i18n 默认中文。
 */
export async function forceZh(page: Page): Promise<void> {
  await page.addInitScript(() => localStorage.setItem('aihome.lang', 'zh'));
}
