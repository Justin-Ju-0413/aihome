import { describe, it, expect } from 'vitest';
import { parseStructuredOutput, computeSimpleDiff, createJsonLineParser } from '../agent-runner';

describe('parseStructuredOutput (claude stream-json)', () => {
  const STREAM = [
    JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: '开始审查' }] } }),
    JSON.stringify({
      type: 'assistant',
      message: {
        content: [{
          type: 'tool_use', name: 'Edit',
          input: { file_path: 'src/a.ts', old_string: 'x', new_string: 'y' },
        }],
      },
    }),
    JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'tool_use', name: 'Write', input: { path: 'docs/note.md' } }] },
    }),
    JSON.stringify({ type: 'user', message: { content: 'ignored' } }),
    'not json at all',
  ].join('\n');

  it('extracts tools, edits and text messages; skips junk lines', () => {
    const r = parseStructuredOutput(STREAM, 'claude');
    expect(r.tools.map((t) => t.name)).toEqual(['Edit', 'Write']);
    expect(r.edits).toEqual([
      { file: 'src/a.ts', action: 'Edit' },
      { file: 'docs/note.md', action: 'Write' },
    ]);
    expect(r.messages).toEqual(['开始审查']);
  });

  it('handles empty/whitespace-only input', () => {
    const r = parseStructuredOutput('', 'claude');
    expect(r.tools).toEqual([]);
    expect(r.edits).toEqual([]);
    expect(r.messages).toEqual([]);
  });
});

describe('parseStructuredOutput (non-claude heuristic)', () => {
  it('flags edit-ish keywords as file modification', () => {
    const r = parseStructuredOutput('I will write the implementation now.', 'codex');
    expect(r.edits).toEqual([{ action: 'file_modification', file: '' }]);
    expect(r.messages).toEqual([]);
  });
  it('no keywords -> no edits', () => {
    expect(parseStructuredOutput('all good', 'codex').edits).toEqual([]);
  });
});


describe('createJsonLineParser (chunked stream)', () => {
  it('reassembles a JSON line split across chunks', () => {
    const lines: string[] = [];
    const feed = createJsonLineParser((l) => lines.push(l));
    const full = JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Edit', input: { file_path: 'a.ts' } }] } });
    // 故意在 JSON 中间切断
    const cut = Math.floor(full.length / 2);
    feed(full.slice(0, cut));
    feed(full.slice(cut) + '\n');
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]).message.content[0].name).toBe('Edit');
  });

  it('handles multiple lines in one chunk and partial tail', () => {
    const lines: string[] = [];
    const feed = createJsonLineParser((l) => lines.push(l));
    feed('{"a":1}\n{"b":2}\n{"c"');
    feed(':3}\n');
    expect(lines).toHaveLength(3);
    expect(lines.map((l) => JSON.parse(l).a ?? JSON.parse(l).b ?? JSON.parse(l).c)).toEqual([1, 2, 3]);
  });

  it('skips blank lines', () => {
    const lines: string[] = [];
    const feed = createJsonLineParser((l) => lines.push(l));
    feed('\n\n{"x":1}\n\n');
    expect(lines).toHaveLength(1);
  });

  it('flushes oversized buffered content instead of growing forever', () => {
    const lines: string[] = [];
    const feed = createJsonLineParser((l) => lines.push(l), 16);
    feed('this-is-a-very-long-line-without-newline-0123456789');
    expect(lines.length).toBeGreaterThan(0);
  });
});

describe('computeSimpleDiff', () => {
  it('produces context lines for identical content', () => {
    const diff = computeSimpleDiff('a\nb', 'a\nb', 'f.txt');
    expect(diff).toBe('--- a/f.txt\n+++ b/f.txt\n a\n b');
  });
  it('marks changed/added/removed lines', () => {
    const diff = computeSimpleDiff('keep\nold', 'keep\nnew\nextra', 'f.txt');
    const lines = diff.split('\n');
    expect(lines).toContain(' keep');
    expect(lines).toContain('-old');
    expect(lines).toContain('+new');
    expect(lines).toContain('+extra');
  });
  it('handles trailing newline differences (null padding)', () => {
    const diff = computeSimpleDiff('a', 'a\n', 'f.txt');
    expect(diff.split('\n')).toContain('+');
  });
});
