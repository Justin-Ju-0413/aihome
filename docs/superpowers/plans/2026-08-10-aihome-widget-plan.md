# AIHome Floating Widget (P2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> 设计文档：`docs/superpowers/specs/2026-08-10-aihome-desktop-design.md`（§5 P2）
> 翻译源：`~/Documents/05-项目代码/ccswitch-usage-widget/ccswitch_widget.py`（K 线桶聚合、涨跌幅、阈值配色）

**Goal:** TokenTicker 以悬浮窗形态回归：Tauri 独立置顶透明窗口加载 `/widget` 页面（紧凑 K 线 + 用量），托盘开关，开机自启。

**Architecture:** 数据复用现有 `GET /api/usage/events`（不新增 Rust 读库）；K 线聚合逻辑 TS 化到 `src/lib/widget/kline.ts`（纯函数）；`/widget` 是普通 Next 页面；Tauri 第二个窗口加载它。

## Global Constraints

- 悬浮窗数据轮询 30s；`prefers-reduced-motion` 降级（组件无动画，天然满足）
- A 股风格配色：涨红跌绿；阈值 🟢 <$20 / 🟡 $20–50 / 🔴 ≥$50
- `data-testid`：`widget-kline` / `widget-total`
- 现有测试全绿；e2e `PORT=3100`
- 提交风格：`feat(widget): ...` / `feat(desktop): ...`

---

### Task 1: kline.ts 纯函数 + /widget 页面与组件

**Files:**
- Create: `src/lib/widget/kline.ts`
- Create: `src/lib/widget/kline.test.ts`
- Create: `src/components/widget/KLine.tsx`
- Create: `src/components/widget/WidgetApp.tsx`
- Create: `src/app/widget/page.tsx`

**Interfaces:**
- Consumes: `GET /api/usage/events`（现有，响应含 `events: [{ timestamp, total_cost }]`）
- Produces:
  - `buildCandles(events: {ts:number;amount:number}[], opts: {bucketMs:number}): Candle[]`，`Candle = { open, high, low, close, count }`
  - `changePercent(from: number, to: number): number`（from=0 返回 0）
  - `spendTier(amountUsd: number): 'green'|'yellow'|'red'`
  - `http://127.0.0.1:3010/widget` 页面（Task 2 Tauri 窗口加载）

- [ ] **Step 1: 读 TokenTicker 聚合逻辑确认语义**

Read: `~/Documents/05-项目代码/ccswitch-usage-widget/ccswitch_widget.py` 中 OHLC 桶聚合与涨跌幅部分
确认：桶内 open=首笔、close=末笔、high/low=极值、count=笔数；涨跌幅 = (close-open)/open。

- [ ] **Step 2: 写失败测试**

```typescript
// src/lib/widget/kline.test.ts
import { describe, expect, it } from 'vitest';
import { buildCandles, changePercent, spendTier } from './kline';

describe('buildCandles', () => {
  it('buckets events into OHLC candles', () => {
    const events = [
      { ts: 1000, amount: 1 },
      { ts: 2000, amount: 3 },
      { ts: 2500, amount: 2 },
      { ts: 9000, amount: 5 },
    ];
    const candles = buildCandles(events, { bucketMs: 3000 });
    expect(candles).toHaveLength(3);
    expect(candles[0]).toEqual({ open: 1, high: 3, low: 1, close: 2, count: 3 });
    expect(candles[2]).toEqual({ open: 5, high: 5, low: 5, close: 5, count: 1 });
  });

  it('handles empty events', () => {
    expect(buildCandles([], { bucketMs: 3000 })).toEqual([]);
  });

  it('handles single event', () => {
    const candles = buildCandles([{ ts: 500, amount: 2 }], { bucketMs: 1000 });
    expect(candles).toHaveLength(1);
    expect(candles[0]).toEqual({ open: 2, high: 2, low: 2, close: 2, count: 1 });
  });
});

describe('changePercent', () => {
  it('computes percent change', () => {
    expect(changePercent(2, 3)).toBeCloseTo(50);
    expect(changePercent(0, 3)).toBe(0);
    expect(changePercent(4, 3)).toBeCloseTo(-25);
  });
});

describe('spendTier', () => {
  it('maps spend to color tier', () => {
    expect(spendTier(10)).toBe('green');
    expect(spendTier(20)).toBe('yellow');
    expect(spendTier(30)).toBe('yellow');
    expect(spendTier(50)).toBe('red');
    expect(spendTier(60)).toBe('red');
  });
});
```

- [ ] **Step 3: 跑测试确认失败**

Run: `npx vitest run src/lib/widget/kline.test.ts`
Expected: FAIL

- [ ] **Step 4: 实现 kline.ts**

```typescript
// src/lib/widget/kline.ts
export type Candle = { open: number; high: number; low: number; close: number; count: number };
export type SpendEvent = { ts: number; amount: number };

export function buildCandles(events: SpendEvent[], opts: { bucketMs: number }): Candle[] {
  if (events.length === 0) return [];
  const sorted = [...events].sort((a, b) => a.ts - b.ts);
  const first = sorted[0].ts;
  const last = sorted[sorted.length - 1].ts;
  const bucketCount = Math.ceil((last - first + 1) / opts.bucketMs);
  const candles: Candle[] = Array.from({ length: bucketCount }, () => ({
    open: 0,
    high: 0,
    low: 0,
    close: 0,
    count: 0,
  }));
  for (const e of sorted) {
    const idx = Math.floor((e.ts - first) / opts.bucketMs);
    const c = candles[idx];
    if (c.count === 0) {
      c.open = c.high = c.low = c.close = e.amount;
    } else {
      c.close = e.amount;
      c.high = Math.max(c.high, e.amount);
      c.low = Math.min(c.low, e.amount);
    }
    c.count += 1;
  }
  return candles;
}

export function changePercent(from: number, to: number): number {
  if (from === 0) return 0;
  return ((to - from) / from) * 100;
}

export type SpendTier = 'green' | 'yellow' | 'red';

export function spendTier(amountUsd: number): SpendTier {
  if (amountUsd >= 50) return 'red';
  if (amountUsd >= 20) return 'yellow';
  return 'green';
}
```

- [ ] **Step 5: 跑测试确认通过**

Run: `npx vitest run src/lib/widget/kline.test.ts`
Expected: 7 passed

- [ ] **Step 6: 实现 KLine 组件**

```tsx
// src/components/widget/KLine.tsx
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
```

- [ ] **Step 7: 实现 WidgetApp**

```tsx
// src/components/widget/WidgetApp.tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { buildCandles, changePercent, spendTier } from '@/lib/widget/kline';
import { KLine } from './KLine';

type UsageEvent = { timestamp: string; total_cost: number };

export function WidgetApp() {
  const [candles, setCandles] = useState<ReturnType<typeof buildCandles>>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/usage/events');
      if (!res.ok) {
        setError(true);
        return;
      }
      const data = (await res.json()) as { events?: UsageEvent[] };
      const events = (data.events ?? []).map((e) => ({
        ts: new Date(e.timestamp).getTime(),
        amount: e.total_cost ?? 0,
      }));
      setCandles(buildCandles(events, { bucketMs: 3600_000 }));
      setTotal(events.reduce((acc, e) => acc + e.amount, 0));
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
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
```

- [ ] **Step 8: 实现页面**

```tsx
// src/app/widget/page.tsx
import { WidgetApp } from '@/components/widget/WidgetApp';

export const metadata = { title: 'AIHome Widget' };

export default function WidgetPage() {
  return (
    <main className="h-screen w-screen overflow-hidden bg-white/95 p-1 dark:bg-gray-900/95">
      <WidgetApp />
    </main>
  );
}
```

- [ ] **Step 9: 手动验证**

Run: `npm run dev -- -p 3100` → 打开 `http://127.0.0.1:3100/widget`
Expected: 紧凑 K 线渲染（有 usage 数据则显示 K 线与总额；无数据显示空图不报错）

- [ ] **Step 10: 全量验证 + Commit**

Run: `npm test`、`npm run lint`、`npx tsc --noEmit`
Expected: 全绿

```bash
git add src/app/widget/ src/components/widget/ src/lib/widget/
git commit -m "feat(widget): TokenTicker k-line widget page (TS port)"
```

---

### Task 2: Tauri 悬浮窗窗口 + 托盘控制 + 自启开关

**Files:**
- Modify: `src-tauri/tauri.conf.json`（加 widget 窗口）
- Modify: `src-tauri/src/lib.rs`（托盘菜单：显示主窗口 / 悬浮窗开关 / 自启开关 / 退出）
- Modify: `src-tauri/capabilities/default.json`（windows 含 widget）

**Interfaces:**
- Consumes: Task 1（/widget 页面）
- Produces: 托盘开关悬浮窗、自启切换；退出清理 next-server

- [ ] **Step 1: tauri.conf.json 加悬浮窗窗口**

```json
"windows": [
  {
    "label": "main",
    "title": "AIHome",
    "url": "http://127.0.0.1:3010",
    "width": 1280,
    "height": 800,
    "minWidth": 1024,
    "minHeight": 640
  },
  {
    "label": "widget",
    "title": "AIHome Widget",
    "url": "http://127.0.0.1:3010/widget",
    "width": 320,
    "height": 480,
    "resizable": false,
    "transparent": true,
    "decorations": false,
    "alwaysOnTop": true,
    "skipTaskbar": true,
    "visible": false
  }
]
```

- [ ] **Step 2: capabilities 加 widget 窗口**

```json
{
  "identifier": "default",
  "windows": ["main", "widget"],
  "permissions": ["core:default", "autostart:default"]
}
```

- [ ] **Step 3: lib.rs 扩展托盘菜单**

```rust
mod server;

use std::time::Duration;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Manager};

fn toggle_window(app: &AppHandle, label: &str) -> tauri::Result<()> {
    if let Some(w) = app.get_webview_window(label) {
        if w.is_visible()? {
            w.hide()?;
        } else {
            w.show()?;
            w.set_focus()?;
        }
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .setup(|app| {
            let exe_dir = app.path().resource_dir().expect("resource dir");
            server::start_next_server(&exe_dir)?;
            server::wait_healthy(Duration::from_secs(30))
                .map_err(|e| Box::<dyn std::error::Error>::from(e))?;

            let show_main = MenuItem::with_id(app, "show_main", "显示主窗口", true, None::<&str>)?;
            let toggle_widget = MenuItem::with_id(app, "toggle_widget", "悬浮窗", true, None::<&str>)?;
            let auto_start = MenuItem::with_id(app, "autostart", "开机自启", true, None::<&str>)?;
            let sep = PredefinedMenuItem::separator(app)?;
            let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_main, &toggle_widget, &auto_start, &sep, &quit])?;

            let enabled = app.autolaunch().is_enabled().unwrap_or(false);
            auto_start.set_text(app, if enabled { "开机自启 ✓" } else { "开机自启" })?;

            let _tray = TrayIconBuilder::with_id("main-tray")
                .menu(&menu)
                .on_menu_event(|app, event| {
                    let _ = match event.id.as_ref() {
                        "quit" => {
                            server::stop_next_server();
                            app.exit(0);
                            Ok(())
                        }
                        "show_main" => toggle_window(app, "main"),
                        "toggle_widget" => toggle_window(app, "widget"),
                        "autostart" => {
                            let enabled = app.autolaunch().is_enabled().unwrap_or(false);
                            if enabled {
                                app.autolaunch().disable()
                            } else {
                                app.autolaunch().enable()
                            }
                            .map_err(|e| Box::<dyn std::error::Error>::from(e))?;
                            event
                                .item
                                .as_ref()
                                .map(|i| i.set_text(app, if !enabled { "开机自启 ✓" } else { "开机自启" }))?;
                            Ok(())
                        }
                        _ => Ok(()),
                    };
                })
                .build(app)?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        if let tauri::RunEvent::ExitRequested { .. } = event {
            server::stop_next_server();
        }
    });
}
```

注意：`app.autolaunch()` 返回 `tauri_plugin_autostart::ManagerExt` 的扩展方法——需在文件顶部 `use tauri_plugin_autostart::ManagerExt;`。`autostart` 菜单项事件里的 `?` 语法：`match` 分支返回 `Result<(), Box<dyn Error>>` 时 `event.item` 为 `Option<&MenuItem>`。

- [ ] **Step 4: 编译 + 手动验证**

Run: `cargo build --manifest-path src-tauri/Cargo.toml`
若 `autostart` 分支编译报错（`?` 不能用于非 Result），改写为：
```rust
"autostart" => {
    let enabled = app.autolaunch().is_enabled().unwrap_or(false);
    let r = if enabled { app.autolaunch().disable() } else { app.autolaunch().enable() };
    if r.is_ok() {
        let _ = event.item.as_ref().map(|i| i.set_text(app, if !enabled { "开机自启 ✓" } else { "开机自启" }));
    }
    Ok(())
}
```

联调（dev 模式，参考 shell plan Task 4 Step 4 的 symlink 方案）：
1. `npm run build:standalone && node .next/standalone/server.js`（PORT/HOSTNAME 注入由 copy-standalone-assets.mjs 完成）
2. `cargo run --manifest-path src-tauri/Cargo.toml`
3. 验证：托盘菜单四项；「悬浮窗」开关出现 320×480 透明置顶窗（显示 K 线）；自启开关切换不报错；退出后 `pgrep -f server.js` 为空

- [ ] **Step 5: Commit**

```bash
git add src-tauri/tauri.conf.json src-tauri/src/lib.rs src-tauri/capabilities/default.json
git commit -m "feat(desktop): floating widget window + tray controls + autostart toggle"
```

---

## P2 完成标准

- `/widget` 页面在 web 形态可用（dev server 直接访问）
- `cargo run` 下托盘四项全工作；悬浮窗开关；自启切换；退出无残留
- `npm test` / `lint` / `tsc` 全绿
