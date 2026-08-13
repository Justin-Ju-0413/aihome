'use client';

import type { Candle } from '@/lib/widget/kline';

export function KLine({ candles }: { candles: Candle[] }) {
  const max = Math.max(...candles.map((c) => c.high), 1e-6);
  const width = 140;
  const height = 40;
  const step = candles.length > 1 ? width / candles.length : width;

  return (
    <svg width={width} height={height} data-testid="widget-kline">
      {candles.map((c, i) => {
        const x = i * step + step / 2;
        const yHigh = height - (c.high / max) * height;
        const yLow = height - (c.low / max) * height;
        const yOpen = height - (c.open / max) * height;
        const yClose = height - (c.close / max) * height;
        const color = c.close >= c.open ? '#dc2626' : '#16a34a';
        return (
          <g key={i}>
            <line x1={x} y1={yHigh} x2={x} y2={yLow} stroke={color} strokeWidth={1} />
            <rect
              x={x - step * 0.3}
              y={Math.min(yOpen, yClose)}
              width={Math.max(step * 0.6, 1)}
              height={Math.max(Math.abs(yOpen - yClose), 1)}
              fill={color}
            />
          </g>
        );
      })}
    </svg>
  );
}
