import type { BalanceResult } from '../types';
import { deepseekAdapter } from './deepseek';
import { openrouterAdapter } from './openrouter';
import { openaiAdapter } from './openai';

export interface BalanceAdapter {
  provider: 'deepseek' | 'openrouter' | 'openai';
  query(key: string, timeoutMs?: number): Promise<BalanceResult>;
}

export const BALANCE_ADAPTERS: Record<string, BalanceAdapter> = {
  deepseek: deepseekAdapter,
  openrouter: openrouterAdapter,
  openai: openaiAdapter,
};

export async function fetchJson(baseUrl: string, pathname: string, key: string, timeoutMs = 10_000): Promise<{ status: number; json: unknown }> {
  const url = new URL(`${baseUrl.replace(/\/$/, '')}${pathname}`);
  if (url.protocol !== 'https:') throw new Error('balance 接口仅允许 https 地址（SSRF 防护）');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
      signal: controller.signal,
      cache: 'no-store',
    });
    let json: unknown = null;
    try {
      json = await res.json();
    } catch {
      json = null;
    }
    return { status: res.status, json };
  } finally {
    clearTimeout(timer);
  }
}
