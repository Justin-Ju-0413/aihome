import { describe, expect, it } from 'vitest';
import { filterByFullText } from './search';
import type { AgentNode } from './types';

function agent(id: string, name: string, description: string, filePath: string): AgentNode {
  return {
    id,
    name,
    type: 'agent',
    ruleFiles: ['AGENTS.md'],
    description,
    filePath,
    dirPath: filePath.replace(/\/[^/]+$/, ''),
    status: 'active',
    associatedFiles: { scripts: 0, references: 0, assets: 0, rules: 0, total: 0 },
    dependencies: [],
    calledBy: [],
    group: 'default',
    position: { x: 0, y: 0 },
    createdAt: '',
    updatedAt: '',
  };
}

const contents: Record<string, string> = {
  '/w/a/AGENTS.md': '# Alpha\n\nHandles PDF parsing with special tokens\n',
  '/w/b/AGENTS.md': '# Beta\n\nSends emails via SMTP\n',
};

describe('filterByFullText', () => {
  it('matches name/description without reading content', async () => {
    const agents = [agent('a', 'Alpha', 'PDF tools', '/w/a/AGENTS.md'), agent('b', 'Beta', 'mailer', '/w/b/AGENTS.md')];
    const result = await filterByFullText(agents, 'mailer', async () => {
      throw new Error('should not read');
    });
    expect(result.map((a) => a.id)).toEqual(['b']);
  });

  it('matches markdown body when full flag set', async () => {
    const agents = [agent('a', 'Alpha', 'PDF tools', '/w/a/AGENTS.md'), agent('b', 'Beta', 'mailer', '/w/b/AGENTS.md')];
    const result = await filterByFullText(agents, 'smtp', (p) => Promise.resolve(contents[p] ?? ''));
    expect(result.map((a) => a.id)).toEqual(['b']);
  });

  it('ignores case in body match', async () => {
    const agents = [agent('a', 'Alpha', 'pdf', '/w/a/AGENTS.md')];
    const result = await filterByFullText(agents, 'TOKENS', (p) => Promise.resolve(contents[p] ?? ''));
    expect(result.map((a) => a.id)).toEqual(['a']);
  });

  it('returns all agents for empty query', async () => {
    const agents = [agent('a', 'Alpha', '', '/w/a/AGENTS.md')];
    const result = await filterByFullText(agents, '  ', () => Promise.resolve(''));
    expect(result).toHaveLength(1);
  });

  it('survives unreadable files', async () => {
    const agents = [agent('a', 'Alpha', '', '/w/a/AGENTS.md'), agent('b', 'Beta', 'mailer', '/w/b/AGENTS.md')];
    // a 的正文本应命中 'parsing'，但读取失败 → 跳过，不抛错
    const result = await filterByFullText(agents, 'parsing', (p) => {
      if (p === '/w/a/AGENTS.md') return Promise.reject(new Error('EACCES'));
      return Promise.resolve(contents[p] ?? '');
    });
    expect(result).toHaveLength(0);
  });
});
