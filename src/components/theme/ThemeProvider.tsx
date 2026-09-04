'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

interface ThemeContextValue {
  /** 当前生效主题(React 侧镜像,SSR 首帧恒为 light,hydrate 后与 html[data-theme] 对齐) */
  theme: Theme;
  /** 显式设置并持久化;不再跟随系统 */
  setTheme: (t: Theme) => void;
  /** 切换到另一主题并持久化 */
  toggle: () => void;
  /** 用户是否显式选择过主题(未选择时跟随系统) */
  isExplicit: boolean;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = 'aihome.theme';

function systemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(t: Theme) {
  document.documentElement.dataset.theme = t;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('light');
  const [isExplicit, setIsExplicit] = useState(false);

  // hydrate 后与 ThemeScript 写入的 html[data-theme] 对齐
  useEffect(() => {
    const el = document.documentElement;
    const current = el.dataset.theme === 'dark' ? 'dark' : 'light';
    setThemeState(current);
    setIsExplicit(el.dataset.themeExplicit === 'true');
  }, []);

  // 未显式选择时跟随系统变化
  useEffect(() => {
    if (isExplicit) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => {
      setThemeState(e.matches ? 'dark' : 'light');
      applyTheme(e.matches ? 'dark' : 'light');
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [isExplicit]);

  const setTheme = useCallback((t: Theme) => {
    applyTheme(t);
    setThemeState(t);
    setIsExplicit(true);
    try {
      localStorage.setItem(STORAGE_KEY, t);
      document.documentElement.dataset.themeExplicit = 'true';
    } catch {
      // localStorage 不可用时仅本次会话生效
    }
  }, []);

  const toggle = useCallback(() => {
    setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
  }, [setTheme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggle, isExplicit }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
