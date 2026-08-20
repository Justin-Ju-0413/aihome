import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createReloadCoalescer } from '../reload-coalesce';

describe('createReloadCoalescer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('coalesces repeated schedules of the same key into one firing', () => {
    const c = createReloadCoalescer(400);
    const fn = vi.fn();
    c.schedule('agents', fn);
    c.schedule('agents', fn);
    c.schedule('agents', fn);
    expect(fn).not.toHaveBeenCalled();
    expect(c.pendingCount()).toBe(1);
    vi.advanceTimersByTime(400);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(c.pendingCount()).toBe(0);
  });

  it('keeps distinct keys independent', () => {
    const c = createReloadCoalescer(400);
    const a = vi.fn();
    const b = vi.fn();
    c.schedule('agents', a);
    c.schedule('tree', b);
    expect(c.pendingCount()).toBe(2);
    vi.advanceTimersByTime(400);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('resets debounce window on newer schedule (fire at most once per burst)', () => {
    const c = createReloadCoalescer(400);
    const fn = vi.fn();
    c.schedule('agents', fn);
    vi.advanceTimersByTime(300);
    c.schedule('agents', fn); // 重置窗口
    vi.advanceTimersByTime(300);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('cancel removes pending schedule without firing', () => {
    const c = createReloadCoalescer(400);
    const fn = vi.fn();
    c.schedule('agents', fn);
    c.cancel('agents');
    vi.advanceTimersByTime(500);
    expect(fn).not.toHaveBeenCalled();
    expect(c.pendingCount()).toBe(0);
  });
});
