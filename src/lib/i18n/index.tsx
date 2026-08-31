'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { en, zh } from './dicts';

export type Lang = 'zh' | 'en';
export type Dict = typeof en;
export type DictKey = keyof Dict;

const STORAGE_KEY = 'aihome.lang';

/** 默认语言：跟随系统（zh* → 中文，其余 → 英文）；localStorage 手动选择优先 */
function detectLang(): Lang {
  if (typeof window === 'undefined') return 'zh';
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'zh' || saved === 'en') return saved;
  } catch {
    // 隐私模式等场景 localStorage 不可用
  }
  return (navigator.language || 'en').toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

export interface I18nValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  /** 翻译；支持 {var} 插值 */
  t: (key: DictKey, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>('zh');

  // hydration 后按系统/localStorage 校正（SSR 阶段固定 zh，避免 mismatch 崩溃）
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 一次性语言校正，非级联渲染
    setLangState(detectLang());
  }, []);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      // 忽略持久化失败
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  }, [lang]);

  const t = useCallback(
    (key: DictKey, vars?: Record<string, string | number>) => {
      const dict = lang === 'zh' ? zh : en;
      let text: string = dict[key] ?? String(key);
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          text = text.replaceAll(`{${k}}`, String(v));
        }
      }
      return text;
    },
    [lang]
  );

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within LanguageProvider');
  return ctx;
}
