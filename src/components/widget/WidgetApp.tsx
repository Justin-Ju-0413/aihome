'use client';

import { useCallback, useEffect, useState } from 'react';
import { changePercent, spendTier } from '@/lib/widget/kline';
import type { Candle } from '@/lib/widget/kline';
import { KLine } from './KLine';

// 真实 API 的 kline 已按小时桶聚合为 OHLC（KlineBucket），直接映射为 Candle
type KlineBucket = { start: number; open: number; high: number; low: number; close: number; count: number };
type UsageResponse = { kline?: KlineBucket[]; totals?: { today: number } };

export function WidgetApp() {
  const [candles, setCandles] = useState<Candle[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/usage/events');
      if (!res.ok) {
        setError(true);
        return;
      }
      const data = (await res.json()) as UsageResponse;
      setCandles((data.kline ?? []).map((b) => ({ open: b.open, high: b.high, low: b.low, close: b.close, count: b.count })));
      setTotal(data.totals?.today ?? 0);
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- widget 挂载时拉取 + 30s 轮询
    load();
    const timer = setInterval(load, 30_000);
    return () => clearInterval(timer);
  }, [load]);

  const tier = spendTier(total);
  const change = candles.length >= 2 ? changePercent(candles[0].open, candles[candles.length - 1].close) : 0;

  if (error) {
    return (
      <div className="p-2 text-[10px] text-gray-400" data-testid="widget-error">
        AIHome 服务不可用——请打开主窗口
      </div>
    );
  }

  return (
    <div className="p-2 text-[10px] leading-tight">
      <div className="flex items-baseline justify-between">
        <span className="font-semibold">AI 花费</span>
        <span
          data-testid="widget-total"
          className={tier === 'green' ? 'text-green-600' : tier === 'yellow' ? 'text-amber-500' : 'text-red-500'}
        >
          ${total.toFixed(2)}{' '}
          <span>
            {change >= 0 ? '▲' : '▼'}
            {Math.abs(change).toFixed(1)}%
          </span>
        </span>
      </div>
      <KLine candles={candles} />
    </div>
  );
}
