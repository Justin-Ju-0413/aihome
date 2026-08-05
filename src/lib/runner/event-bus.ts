import { EventEmitter } from 'node:events';

const emitter = new EventEmitter();
emitter.setMaxListeners(100);

export function on(event: string, handler: (data: unknown) => void): () => void {
  emitter.on(event, handler);
  return () => emitter.off(event, handler);
}

export function emit(event: string, data: unknown): void {
  for (const listener of emitter.listeners(event)) {
    try {
      (listener as (d: unknown) => void)(data);
    } catch {
      // 订阅方错误不得中断广播
    }
  }
}
