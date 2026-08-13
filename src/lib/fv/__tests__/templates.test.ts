import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { getDb, resetDbForTests } from '../db';
import { initBuiltinTemplates, createTemplate, listTemplates, listTemplatesByCategory, getTemplate, deleteTemplate, applyTemplate } from '../templates';
import { parseStructuredOutput, computeSimpleDiff } from '../agent-runner';

const DB_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'fv-tpl-test-'));

beforeEach(() => {
  resetDbForTests();
  process.env.AIHOME_FV_DB = path.join(DB_DIR, 'tpl.db');
  process.env.AIHOME_FV_LEGACY_DB = path.join(DB_DIR, 'no-legacy.db');
  getDb();
  initBuiltinTemplates();
});

afterEach(() => {
  resetDbForTests();
  delete process.env.AIHOME_FV_DB;
  delete process.env.AIHOME_FV_LEGACY_DB;
});

describe('fv templates', () => {
  it('seeds 6 builtin templates idempotently', () => {
    expect(listTemplates()).toHaveLength(6);
    initBuiltinTemplates();
    expect(listTemplates()).toHaveLength(6);
    expect(listTemplatesByCategory('paper')).toHaveLength(3);
    expect(listTemplatesByCategory('code')).toHaveLength(2);
  });

  it('creates and deletes custom templates', () => {
    const id = createTemplate({ name: 'custom', provider: 'codex', prompt: 'do {{x}}', steps: ['a'], variables: ['x'], category: 'general' });
    const tpl = getTemplate(id);
    expect(tpl?.name).toBe('custom');
    expect(tpl?.steps).toEqual(['a']);
    deleteTemplate(id);
    expect(getTemplate(id)).toBeNull();
  });

  it('applies template variables with defaults and strips leftovers', () => {
    const rendered = applyTemplate('tpl-code-review', { '文件路径': '/src/a.ts' });
    expect(rendered.prompt).toContain('/src/a.ts');
    expect(rendered.prompt).not.toContain('{{');

    const ppt = applyTemplate('tpl-ppt-create', {});
    expect(ppt.prompt).toContain('10'); // {{页数:10}} 默认值被替换
    expect(ppt.prompt).not.toContain('{{');
  });
});

describe('fv agent-runner pure functions', () => {
  it('parses claude stream-json tool_use and text messages', () => {
    const input = [
      JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'start' }] } }),
      JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Edit', input: { file_path: '/a.ts' } }] } }),
      'plain line',
    ].join('\n');
    const parsed = parseStructuredOutput(input, 'claude');
    expect(parsed.tools).toHaveLength(1);
    expect(parsed.tools[0].name).toBe('Edit');
    expect(parsed.edits).toHaveLength(1);
    expect(parsed.edits[0].file).toBe('/a.ts');
    expect(parsed.messages).toEqual(['start']);
  });

  it('uses keyword heuristics for codex output', () => {
    const parsed = parseStructuredOutput('I will edit some files now', 'codex');
    expect(parsed.edits.length).toBeGreaterThan(0);
  });

  it('computes a line-based simple diff', () => {
    const diff = computeSimpleDiff('a\nb\nc', 'a\nB\nc\nd', 'f.ts');
    const lines = diff.split('\n');
    expect(lines[0]).toBe('--- a/f.ts');
    expect(lines[1]).toBe('+++ b/f.ts');
    expect(lines).toContain(' a');
    expect(lines).toContain('-b');
    expect(lines).toContain('+B');
    expect(lines).toContain(' c');
    expect(lines).toContain('+d');
  });
});
