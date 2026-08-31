// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createElement, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { LanguageProvider, useI18n } from './index';

/**
 * i18n LanguageProvider 测试。
 * 注意:子组件 effect 先于父组件执行,Probe 首次报告时 provider 尚未完成
 * 语言校正(SSR 阶段固定 zh),因此 Probe 在语言变化时持续报告,
 * 断言取最后一次报告(latest)。
 */

type Snapshot = { lang: string; text: string; setLang: (l: 'zh' | 'en') => void };

function Probe({ report }: { report: (v: Snapshot) => void }) {
  const { lang, t, setLang } = useI18n();
  useEffect(() => {
    report({ lang, text: t('common.save'), setLang });
  });
  return null;
}

let root: ReturnType<typeof createRoot> | null = null;
let host: HTMLDivElement | null = null;

/** jsdom 环境无可靠 localStorage,注入内存版 */
function installStorage(): void {
  const store = new Map<string, string>();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    },
  });
}

function mount(snapshots: Snapshot[]): Promise<void> {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  return act(async () => {
    root!.render(createElement(LanguageProvider, null, createElement(Probe, { report: (v) => snapshots.push(v) })));
  });
}

beforeEach(() => {
  installStorage();
  localStorage.clear();
  document.body.innerHTML = '';
});

afterEach(() => {
  if (root) {
    act(() => root!.unmount());
    root = null;
  }
  host = null;
  document.body.innerHTML = '';
});

describe('i18n LanguageProvider', () => {
  it('follows system language by default (zh → Chinese, others → English)', async () => {
    Object.defineProperty(navigator, 'language', { value: 'zh-CN', configurable: true });
    const seen: Snapshot[] = [];
    await mount(seen);
    expect(seen.at(-1)?.lang).toBe('zh');
    expect(seen.at(-1)?.text).toBe('保存');
  });

  it('falls back to English for non-Chinese system language', async () => {
    Object.defineProperty(navigator, 'language', { value: 'en-US', configurable: true });
    const seen: Snapshot[] = [];
    await mount(seen);
    expect(seen.at(-1)?.lang).toBe('en');
    expect(seen.at(-1)?.text).toBe('Save');
  });

  it('localStorage manual choice overrides system language', async () => {
    Object.defineProperty(navigator, 'language', { value: 'zh-CN', configurable: true });
    localStorage.setItem('aihome.lang', 'en');
    const seen: Snapshot[] = [];
    await mount(seen);
    expect(seen.at(-1)?.lang).toBe('en');
    expect(seen.at(-1)?.text).toBe('Save');
  });

  it('setLang switches language and persists to localStorage', async () => {
    Object.defineProperty(navigator, 'language', { value: 'en-US', configurable: true });
    const seen: Snapshot[] = [];
    await mount(seen);
    expect(seen.at(-1)?.lang).toBe('en');
    act(() => seen.at(-1)!.setLang('zh'));
    expect(seen.at(-1)?.lang).toBe('zh');
    expect(seen.at(-1)?.text).toBe('保存');
    expect(localStorage.getItem('aihome.lang')).toBe('zh');
  });
});
