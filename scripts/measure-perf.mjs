/**
 * 性能基线度量脚本（P0）
 *
 * 用法:
 *   node scripts/measure-perf.mjs [--base http://127.0.0.1:3210] [--out docs/perf/baseline.json] [--repeat 3]
 *
 * 对每个关键路由采集:
 *   - LCP / CLS（PerformanceObserver）
 *   - loadEventEnd / DCL
 *   - 资源传输总大小与请求数
 * 输出 JSON 供 P2 前后对比。
 */
import { chromium } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const args = process.argv.slice(2);
function flag(name, fallback) {
  const eq = args.find((a) => a.startsWith(`${name}=`))?.split('=').slice(1).join('=');
  if (eq !== undefined) return eq;
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
}
const base = flag('--base', 'http://127.0.0.1:3210');
const outPath = flag('--out', 'docs/perf/baseline.json');
const repeat = Number(flag('--repeat', '3'));
const only = flag('--only', null);

const ROUTES = [
  '/', '/board', '/graph', '/agents',
  // 真实 sample agent id（base64url），非 ASCII 路径故不用字面量
  '/agents/' + encodeURIComponent('L1VzZXJzL2dzdGFyL0RvY3VtZW50cy8wNS3pobnnm67ku6PnoIEvQUlIb21lL2RhdGEvc2FtcGxlLWFnZW50cy9jb2RlLWFzc2lzdGFudC9BR0VOVFMubWQ'),
  '/skills', '/settings', '/health', '/usage', '/console', '/workbench', '/sync', '/onboarding',
];

if (process.argv.includes('--list-routes')) {
  for (const r of ROUTES) console.log(r);
  process.exit(0);
}
const ROUTE_LIST = only ? [only] : ROUTES;

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error(`timeout after ${ms}ms ${label}`)), ms)),
  ]);
}

/** 结果归一化：同一路由多次采样取中位数 */
function median(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

async function measurePage(page) {
  return await page.evaluate(async () => {
    const nav = performance.getEntriesByType('navigation')[0];
    const resources = performance.getEntriesByType('resource');
    const lcpEntry = [...performance.getEntriesByType('largest-contentful-paint')]
      .pop();
    // LCP/CLS：buffered 重放（LCP 若无候选则回退 null）
    const cls = await new Promise((res) => {
      new PerformanceObserver((list) => {
        res(list.getEntries().reduce((s, e) => s + e.value, 0));
      }).observe({ type: 'layout-shift', buffered: true });
      setTimeout(() => res(null), 300);
    });
    return {
      route: new URL(location.href).pathname,
      fcp: performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null,
      lcp: lcpEntry?.startTime ?? null,
      cls,
      dcl: nav ? Math.round(nav.domContentLoadedEventEnd) : null,
      load: nav ? Math.round(nav.loadEventEnd) : null,
      transferBytes: Math.round(
        resources.reduce((s, r) => s + (r.transferSize || 0), 0)
      ),
      resources: resources.length,
      jsBytes: Math.round(
        resources
          .filter((r) => r.initiatorType === 'script')
          .reduce((s, r) => s + (r.transferSize || 0), 0)
      ),
    };
  });
}

async function main() {
  mkdirSync(dirname(outPath), { recursive: true });
  const browser = await chromium.launch();
  const results = { generatedAt: new Date().toISOString(), base, pages: [] };
  const watchdog = setTimeout(() => {
    console.error('[watchdog] 240s 超时，写出已采集部分');
    writeFileSync(outPath, JSON.stringify(results, null, 2));
    process.exit(2);
  }, 240_000);

  for (const route of ROUTE_LIST) {
    const samples = [];
    // 复用单 context/page（逐路由 full navigation），末尾统一关浏览器。
    // 避免每样本新建/强关 context —— 重页面（graph 等）的 renderer 会累计拖垮浏览器。
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    for (let i = 0; i < repeat; i++) {
      try {
        console.error(`  ${route} #${i + 1} … `);
        await withTimeout(page.goto(base + route, { waitUntil: 'domcontentloaded' }), 20000, `goto ${route}`);
        // Next App Router 的 JS chunk 在 DCL 后经 RSC 流式注入，
        // 必须等到 JS 资源出现 + 页面 complete 才算稳定（避免 transferSize 尚未回填）。
        await withTimeout(
          page
            .waitForFunction(
              () =>
                document.readyState === 'complete' &&
                performance.getEntriesByType('resource').some((r) => r.name.endsWith('.js') && (r.transferSize || 0) > 0),
              { polling: 100 },
            )
            .catch(() => {}),
          8000,
          `settle ${route}`,
        );
        // 等 LCP/CLS 稳定
        await page.waitForTimeout(2000);
        samples.push(await measurePage(page));
        console.error('ok');
      } catch (e) {
        samples.push({ route, error: String(e).slice(0, 200) });
        console.error(`ERR: ${String(e).slice(0, 120)}`);
      }
    }
    await withTimeout(ctx.close(), 5000, `close ctx ${route}`).catch(() => {});
    const ok = samples.filter((s) => !s.error);
    const row = {
      route,
      samples: ok.length,
      fcp: median(ok.map((s) => s.fcp).filter((v) => v != null)),
      lcp: median(ok.map((s) => s.lcp).filter((v) => v != null)),
      cls: median(ok.map((s) => s.cls).filter((v) => v != null)),
      dcl: median(ok.map((s) => s.dcl).filter((v) => v != null)),
      load: median(ok.map((s) => s.load).filter((v) => v != null)),
      transferKB: ok.length ? Math.round(median(ok.map((s) => s.transferBytes)) / 1024) : null,
      jsKB: ok.length ? Math.round(median(ok.map((s) => s.jsBytes)) / 1024) : null,
      resources: ok.length ? median(ok.map((s) => s.resources)) : null,
    };
    results.pages.push(row);
    console.log(JSON.stringify(row));
  }
  clearTimeout(watchdog);
  await browser.close();
  writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`\nwritten → ${resolve(outPath)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
