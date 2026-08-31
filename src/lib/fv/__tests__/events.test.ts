import { describe, it, expect, afterEach } from 'vitest';
import { emitEvent, listEvents, onEvent } from '../events';

const offs: Array<() => void> = [];
afterEach(() => {
  offs.splice(0).forEach((off) => off());
});

describe('fv events', () => {
  it('assigns monotonically increasing seq and timestamps', () => {
    const e1 = emitEvent({ type: 'a' });
    const e2 = emitEvent({ type: 'b' });
    expect(e2.seq).toBe(e1.seq + 1);
    expect(e2.ts).toBeGreaterThanOrEqual(e1.ts);
  });

  it('returns only events after cursor', () => {
    const e1 = emitEvent({ type: 'a' });
    emitEvent({ type: 'b' });
    const { events, cursor } = listEvents(e1.seq);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('b');
    expect(cursor).toBe(events[0].seq);
    // 无新事件时 cursor 保持不变
    const again = listEvents(cursor);
    expect(again.events).toHaveLength(0);
    expect(again.cursor).toBe(cursor);
  });

  it('notifies subscribers and tolerates subscriber errors', () => {
    const seen: string[] = [];
    offs.push(onEvent((e) => seen.push(e.type)));
    offs.push(
      onEvent(() => {
        throw new Error('boom');
      })
    );
    emitEvent({ type: 'x' });
    expect(seen).toEqual(['x']);
  });

  it('trims buffer beyond capacity', () => {
    for (let i = 0; i < 2500; i++) emitEvent({ type: `e${i}` });
    // 全部历史 seq 1..2500；缓冲裁剪后最早 seq 应 > 500
    const { events } = listEvents(0);
    expect(events.length).toBeLessThan(2500);
    expect(events[0].seq).toBeGreaterThan(500);
  });

  it('signals gap when cursor falls behind the trimmed buffer', () => {
    for (let i = 0; i < 2500; i++) emitEvent({ type: `g${i}` });
    // 旧 cursor（0）对应的早期事件已被裁剪丢弃 → 必须返回 gap 信号
    const { events, cursor, gap } = listEvents(0);
    expect(events.length).toBeGreaterThan(0);
    expect(gap).toBe(true);
    // 从最新 cursor 继续拉取：无 gap
    const next = listEvents(cursor);
    expect(next.gap).toBeUndefined();
    // 恰好从缓冲最老事件的前一条继续：无 gap（未丢失）
    const oldest = events[0].seq;
    const edge = listEvents(oldest - 1);
    expect(edge.gap).toBeUndefined();
  });
});
