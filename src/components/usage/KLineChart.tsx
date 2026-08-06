'use client';

import { useEffect, useRef, useState } from 'react';
import type { KlineBucket } from '@/lib/usage/aggregate';

interface Props {
  buckets: KlineBucket[];
  dimension: 'cost' | 'tokens';
}

const UP = '#ef4444';
const DOWN = '#10b981';
const HIGHLIGHT = '#f59e0b';

export function KLineChart({ buckets, dimension }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState<{ x: number; y: number; bucket: KlineBucket } | null>(null);
  const [width, setWidth] = useState(300);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      const rect = container.getBoundingClientRect();
      setWidth(rect.width);
      const dpr = window.devicePixelRatio || 1;
      const w = Math.max(rect.width, 10);
      const h = 300;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      if (buckets.length === 0) {
        ctx.fillStyle = '#6b7280';
        ctx.font = '13px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('No data in this range', w / 2, h / 2);
        return;
      }

      let min = Infinity;
      let max = -Infinity;
      for (const b of buckets) {
        min = Math.min(min, b.low);
        max = Math.max(max, b.high);
      }
      if (min === max) {
        if (min === 0) { min = 0; max = 1; }
        else { min *= 0.9; max *= 1.1; }
      }
      const pad = (max - min) * 0.1;
      min -= pad;
      max += pad;

      const plotW = w - 8;
      const plotH = h - 8;
      const xStep = plotW / buckets.length;
      const candleW = Math.max(Math.min(xStep * 0.6, 40), 2);
      const yOf = (v: number) => 4 + plotH - ((v - min) / (max - min)) * plotH;

      buckets.forEach((b, i) => {
        const x = 4 + xStep * i + xStep / 2;
        const color = b.close >= b.open ? UP : DOWN;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, yOf(b.high));
        ctx.lineTo(x, yOf(b.low));
        ctx.stroke();
        const top = yOf(Math.max(b.open, b.close));
        const height = Math.max(Math.abs(yOf(b.open) - yOf(b.close)), 1);
        ctx.fillStyle = color;
        ctx.fillRect(x - candleW / 2, top, candleW, height);
      });

      const lx = 4 + plotW - xStep / 2;
      ctx.strokeStyle = HIGHLIGHT;
      ctx.lineWidth = 2;
      ctx.strokeRect(lx - candleW / 2 - 2, 2, candleW + 4, plotH);
    };

    draw();
    setHover(null);
    const ro = new ResizeObserver(draw);
    ro.observe(container);
    return () => ro.disconnect();
  }, [buckets]);

  const onMove = (e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || buckets.length === 0) return;
    const relX = e.clientX - rect.left - 4;
    const xStep = (rect.width - 8) / buckets.length;
    const idx = Math.max(0, Math.min(buckets.length - 1, Math.floor(relX / xStep)));
    const bucket = buckets[idx];
    setHover({ x: e.clientX - rect.left, y: e.clientY - rect.top, bucket });
  };

  const fmt = (v: number) => (dimension === 'cost' ? `$${v.toFixed(4)}` : String(Math.round(v)));

  return (
    <div ref={containerRef} data-testid="usage-kline-chart" className="relative">
      <canvas
        ref={canvasRef}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        className="w-full block"
      />
      {hover && (
        <div
          className="pointer-events-none absolute bg-neutral-900 text-white text-xs rounded px-2 py-1"
          style={{
            left: Math.min(hover.x, width - 220),
            top: Math.max(hover.y - 40, 4),
          }}
        >
          {new Date(hover.bucket.start).toLocaleString()} · O {fmt(hover.bucket.open)} / H {fmt(hover.bucket.high)} / L {fmt(hover.bucket.low)} / C {fmt(hover.bucket.close)} · n={hover.bucket.count}
        </div>
      )}
    </div>
  );
}
