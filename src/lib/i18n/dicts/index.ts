import { commonEn } from './common.en';
import { commonZh } from './common.zh';
import { consoleEn } from './console.en';
import { consoleZh } from './console.zh';
import { boardEn } from './board.en';
import { boardZh } from './board.zh';
import { settingsEn } from './settings.en';
import { settingsZh } from './settings.zh';
import { syncEn } from './sync.en';
import { syncZh } from './sync.zh';
import { miscEn } from './misc.en';
import { miscZh } from './misc.zh';
import { vaultEn } from './vault.en';
import { vaultZh } from './vault.zh';

/** 英文基准字典（平铺 key） */
export const en = {
  ...commonEn,
  ...consoleEn,
  ...boardEn,
  ...settingsEn,
  ...syncEn,
  ...miscEn,
  ...vaultEn,
} as const;

/** 中文：键与英文基准完全一致（缺键/多余键由 tsc 报错） */
export const zh: Record<keyof typeof en, string> = {
  ...commonZh,
  ...consoleZh,
  ...boardZh,
  ...settingsZh,
  ...syncZh,
  ...miscZh,
  ...vaultZh,
};
