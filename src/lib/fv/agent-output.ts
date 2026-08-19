import { stmts, type Row } from './db';
import { emitEvent } from './events';

/**
 * Agent 输出解析：claude/codex 流式 JSON 解析、步骤进度识别。
 * 从 agent-runner 拆出，保持行为不变。
 */

export interface StructuredOutput {
  tools: Array<{ name: string; input: Record<string, unknown> }>;
  edits: Array<{ file: string; action: string }>;
  messages: string[];
}

function emptyStructuredOutput(): StructuredOutput {
  return { tools: [], edits: [], messages: [] };
}

/** 解析一行 claude stream-json（对象累积到 result）。非 JSON / 非 assistant 行静默跳过。 */
function parseClaudeJsonLine(line: string, result: StructuredOutput): void {
  try {
    const obj = JSON.parse(line);
    if (obj.type === 'assistant' && obj.message?.content) {
      const content = Array.isArray(obj.message.content) ? obj.message.content : [obj.message.content];
      for (const c of content) {
        if (c.type === 'tool_use') {
          result.tools.push({ name: c.name, input: c.input ?? {} });
          if (c.name === 'Edit' || c.name === 'Write') {
            result.edits.push({ file: c.input?.file_path || c.input?.path || '', action: c.name });
          }
        }
        if (c.type === 'text') result.messages.push(c.text?.substring(0, 200));
      }
    }
  } catch {
    // 跳过非 JSON 行
  }
}

export function parseStructuredOutput(text: string, provider: string): StructuredOutput {
  const result = emptyStructuredOutput();
  if (provider === 'claude') {
    for (const line of text.split('\n')) {
      if (line.trim().startsWith('{')) parseClaudeJsonLine(line, result);
    }
  } else {
    if (text.includes('edit') || text.includes('write') || text.includes('modify')) {
      result.edits.push({ action: 'file_modification', file: '' });
    }
  }
  return result;
}

/**
 * 流式 JSON 增量解析器：stdout chunk 落在任意字节边界，把 chunk 拼进行缓冲、
 * 按换行切出完整行回调，残尾留到下一 chunk。JSON 行被切断时不再整条丢失。
 * 无换行的超长缓冲（防御性）按整块回调一次并清空，避免内存无限膨胀。
 */
export function createJsonLineParser(
  onLine: (line: string) => void,
  maxBufferBytes = 1_000_000
): (chunk: string) => void {
  let buffer = '';
  return (chunk: string) => {
    buffer += chunk;
    let idx: number;
    while ((idx = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 1);
      if (line.trim()) onLine(line);
    }
    if (buffer.length > maxBufferBytes) {
      if (buffer.trim()) onLine(buffer);
      buffer = '';
    }
  };
}

export function detectStepProgress(
  text: string,
  steps: Row[],
  currentIdx: number,
  agentId: string,
  onStepAdvance: (idx: number) => void
): void {
  if (!steps || currentIdx >= steps.length) return;
  const keywords = ['edit', 'write', 'create', 'refactor', 'test', 'lint', 'done', 'complete', 'fix', 'update', 'analyz', 'generat', 'modif'];
  const lower = text.toLowerCase();
  if (keywords.some((k) => lower.includes(k))) {
    const nextIdx = Math.min(currentIdx + 1, steps.length - 1);
    if (nextIdx > currentIdx) {
      stmts.updateStep({ agentId, stepNum: Number(steps[currentIdx].step_num), status: 'done' });
      if (nextIdx < steps.length) {
        stmts.updateStep({ agentId, stepNum: Number(steps[nextIdx].step_num), status: 'active' });
      }
      onStepAdvance(nextIdx);
      emitEvent({ type: 'agent:step', agentId, stepNum: nextIdx, stepName: steps[nextIdx]?.name });
    }
  }
}
