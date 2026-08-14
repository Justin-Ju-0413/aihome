'use client';

import { useEffect } from 'react';

/**
 * 液态玻璃指针驱动:监听全局 pointermove(rAF 节流),
 * 把指针坐标写入当前悬停的玻璃面板(--px/--py,面板相对坐标),
 * 驱动 .glass-* 的 ::after 径向光泽跟随。仅更新悬停元素,不触发 React 重渲染。
 */
export function GlassCursor() {
  useEffect(() => {
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const target = e.target as Element | null;
        const glass = target?.closest?.('.glass-nav, .glass-panel, .glass-sidebar, .glass-modal');
        if (glass instanceof HTMLElement) {
          const rect = glass.getBoundingClientRect();
          glass.style.setProperty('--px', `${e.clientX - rect.left}px`);
          glass.style.setProperty('--py', `${e.clientY - rect.top}px`);
        }
      });
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return null;
}
