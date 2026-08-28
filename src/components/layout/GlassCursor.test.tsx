// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { GlassCursor } from './GlassCursor';

/**
 * GlassCursor 动态光效测试。
 * jsdom 不实现布局:getBoundingClientRect 恒为 0,故对测试面板 mock 其 rect,
 * 用于验证 "--px/--py = clientX/Y - 面板左上角" 的相对坐标写入。
 */

const PointerMoveEvent =
  typeof PointerEvent !== 'undefined' ? PointerEvent : (MouseEvent as unknown as typeof PointerEvent);

let root: ReturnType<typeof createRoot> | null = null;
let host: HTMLDivElement | null = null;

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  if (root) {
    act(() => {
      root!.unmount();
      root = null;
    });
  }
  host = null;
  document.body.innerHTML = '';
});

async function mountCursor(): Promise<void> {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<GlassCursor />);
  });
}

function makePanel(): HTMLDivElement {
  const panel = document.createElement('div');
  panel.className = 'glass-panel';
  panel.style.cssText = 'position:absolute;left:100px;top:100px;width:400px;height:300px';
  // jsdom 无布局引擎,固定 rect 供 getBoundingClientRect 使用
  panel.getBoundingClientRect = () =>
    ({ left: 100, top: 100, right: 500, bottom: 400, width: 400, height: 300, x: 100, y: 100 }) as DOMRect;
  document.body.appendChild(panel);
  return panel;
}

function nextFrames(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    } else {
      resolve();
    }
  });
}

describe('GlassCursor', () => {
  it('writes pointer coordinates relative to the hovered glass panel (--px/--py)', async () => {
    await mountCursor();
    const panel = makePanel();
    const inner = document.createElement('span');
    panel.appendChild(inner);

    await act(async () => {
      inner.dispatchEvent(new PointerMoveEvent('pointermove', { bubbles: true, clientX: 250, clientY: 200 }));
      await nextFrames();
    });

    expect(panel.style.getPropertyValue('--px')).toBe('150px');
    expect(panel.style.getPropertyValue('--py')).toBe('100px');
  });

  it('ignores moves outside glass elements', async () => {
    await mountCursor();
    const plain = document.createElement('div');
    document.body.appendChild(plain);

    await act(async () => {
      plain.dispatchEvent(new PointerMoveEvent('pointermove', { bubbles: true, clientX: 50, clientY: 50 }));
      await nextFrames();
    });

    expect(plain.style.getPropertyValue('--px')).toBe('');
    expect(plain.style.getPropertyValue('--py')).toBe('');
  });

  it('stops writing after unmount (listener cleanup)', async () => {
    await mountCursor();
    const panel = makePanel();
    act(() => {
      root!.unmount();
      root = null;
    });

    act(() => {
      panel.dispatchEvent(new PointerMoveEvent('pointermove', { bubbles: true, clientX: 250, clientY: 200 }));
    });
    await act(async () => { await nextFrames(); });

    expect(panel.style.getPropertyValue('--px')).toBe('');
  });
});
