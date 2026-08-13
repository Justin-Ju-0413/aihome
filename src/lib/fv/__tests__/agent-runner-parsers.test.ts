import { describe, it, expect } from 'vitest';
import { parseStructuredOutput, computeSimpleDiff } from '../agent-runner';

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
