/**
 * 事件总线 + 环形缓冲。
 * 替代原 FileVision 的 WebSocket 广播：所有运行时事件写入环形缓冲，
 * 前端通过 GET /api/fv/events?cursor= 轮询增量拉取。
 */

export interface FvEvent extends Record<string, unknown> {
  seq: number;
  ts: number;
  type: string;
}

const EVENT_BUFFER_SIZE = 2000;

let seq = 0;
const buffer: FvEvent[] = [];
const subscribers = new Set<(event: FvEvent) => void>();

export function emitEvent(payload: { type: string } & Record<string, unknown>): FvEvent {
  const event: FvEvent = { seq: ++seq, ts: Date.now(), ...payload };
  buffer.push(event);
  if (buffer.length > EVENT_BUFFER_SIZE) buffer.splice(0, buffer.length - EVENT_BUFFER_SIZE);
  for (const fn of subscribers) {
    try {
      fn(event);
    } catch {
      // 订阅者异常不影响事件主链路
    }
  }
  return event;
}

/** 全局订阅（用于 orchestrator 内部把 agent:output 汇入 run 输出缓冲等场景） */
export function onEvent(fn: (event: FvEvent) => void): () => void {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

/**
 * 返回 seq > cursor 的事件，供前端轮询。
 * 当 cursor 落后于缓冲已裁剪的最早事件时返回 gap:true——调用方应重置状态
 * （如全量重拉），否则中间事件被静默丢弃、前端无从感知。
 */
export function listEvents(cursor: number): { events: FvEvent[]; cursor: number; gap?: boolean } {
  const oldestSeq = buffer.length > 0 ? buffer[0].seq : 0;
  const gap = buffer.length > 0 && cursor < oldestSeq - 1;
  const events = buffer.filter((e) => e.seq > cursor);
  return { events, cursor: events.length > 0 ? events[events.length - 1].seq : cursor, gap: gap || undefined };
}
