'use client';

import { createContext, useCallback, useContext, useSyncExternalStore } from 'react';

export type Theme = 'light' | 'dark';

interface ThemeContextValue {
  /** 当前生效主题(SSR 首帧恒为 light,hydrate 后与 html[data-theme] 对齐) */
  theme: Theme;
  /** 显式设置并持久化;之后不再跟随系统 */
  setTheme: (t: Theme) => void;
  /** 切换到另一主题并持久化 */
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = 'aihome.theme';
const THEME_EVENT = 'aihome:theme-change';

function applyTheme(t: Theme) {
  document.documentElement.dataset.theme = t;
}

function persist(t: Theme) {
  try {
    localStorage.setItem(STORAGE_KEY, t);
  } catch {
    // localStorage 不可用时仅本次会话生效
  }
}

/** 主题真相源是 html[data-theme](由 ThemeScript 在 hydrate 前写入)。 */
function subscribe(onChange: () => void) {
  window.addEventListener(THEME_EVENT, onChange);

  // 用户未显式选择时跟随系统
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const onSystem = () => {
    let explicit = false;
    try {
      explicit = localStorage.getItem(STORAGE_KEY) === 'light' || localStorage.getItem(STORAGE_KEY) === 'dark';
    } catch {
      explicit = false;
    }
    if (!explicit) {
      applyTheme(mq.matches ? 'dark' : 'light');
    }
    onChange();
  };
  mq.addEventListener('change', onSystem);

  return () => {
    window.removeEventListener(THEME_EVENT, onChange);
    mq.removeEventListener('change', onSystem);
  };
}

function getSnapshot(): Theme {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

function getServerSnapshot(): Theme {
  return 'light';
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setTheme = useCallback((t: Theme) => {
    applyTheme(t);
    persist(t);
    window.dispatchEvent(new Event(THEME_EVENT));
  }, []);

  const toggle = useCallback(() => {
    setTheme(getSnapshot() === 'dark' ? 'light' : 'dark');
  }, [setTheme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
