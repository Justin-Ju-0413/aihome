import { describe, expect, it } from 'vitest';
import type { AgentNode } from '../types';
import {
  extractDependencyNamesFromSections,
  normalizeDepNames,
  resolveDependencies,
} from '../dependencies';

function makeAgent(overrides: Partial<AgentNode>): AgentNode {
  return {
    id: 'id-' + Math.random().toString(36).slice(2, 8),
    name: 'Agent',
    type: 'agent',
    ruleFiles: ['AGENTS.md'],
    description: '',
    filePath: '/tmp/x/AGENTS.md',
    dirPath: '/tmp/x',
    status: 'active',
    associatedFiles: { scripts: 0, references: 0, assets: 0, rules: 0, total: 0 },
    dependencies: [],
    calledBy: [],
    group: 'default',
    position: { x: 0, y: 0 },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('extractDependencyNamesFromSections', () => {
  it('parses plain, wiki-link, markdown-link and code-spanned items', () => {
    const sections = [
      {
        title: 'Dependencies',
        content: [
          '- Code Assistant',
          '- [[Graph Explorer]]',
          '- [Linter](path/to/linter)',
          '- `Tester`',
          '* Notes reviewer',
        ].join('\n'),
      },
    ];
    expect(extractDependencyNamesFromSections(sections)).toEqual([
      'Code Assistant',
      'Graph Explorer',
      'Linter',
      'Tester',
      'Notes reviewer',
    ]);
  });

  it('matches case-insensitive section titles (Depends On / 依赖) and ignores missing', () => {
    expect(extractDependencyNamesFromSections([{ title: 'Depends On', content: '- A' }])).toEqual(['A']);
    expect(extractDependencyNamesFromSections([{ title: '依赖', content: '- B' }])).toEqual(['B']);
    expect(extractDependencyNamesFromSections([{ title: 'Overview', content: '- C' }])).toEqual([]);
  });
});

describe('normalizeDepNames', () => {
  it('handles array, comma string and empty', () => {
    expect(normalizeDepNames([' a ', 'b'])).toEqual(['a', 'b']);
    expect(normalizeDepNames('a, b ,c')).toEqual(['a', 'b', 'c']);
    expect(normalizeDepNames(undefined)).toEqual([]);
    expect(normalizeDepNames(42)).toEqual([]);
  });
});

describe('resolveDependencies', () => {
  it('links forward and reverse edges by name, skipping self', () => {
    const a = makeAgent({ id: 'a', name: 'Alpha', dirPath: '/p/alpha' });
    const b = makeAgent({ id: 'b', name: 'Beta', dirPath: '/p/beta' });
    const agents = [a, b];
    const deps = new Map<string, string[]>(Object.entries({ a: ['Beta'], b: [] }));
    resolveDependencies(agents, deps);
    expect(a.dependencies).toEqual(['b']);
    expect(b.calledBy).toEqual(['a']);
    expect(b.dependencies).toEqual([]);
  });

  it('matches by directory basename and is case-insensitive', () => {
    const a = makeAgent({ id: 'a', name: 'Alpha', dirPath: '/p/alpha-tool' });
    const b = makeAgent({ id: 'b', name: 'Someone', dirPath: '/p/ToolPack' });
    const agents = [a, b];
    const deps = new Map<string, string[]>(Object.entries({ a: ['toolpack'], b: ['TOOLPACK'] }));
    // self-reference (b -> b) must be dropped
    resolveDependencies(agents, deps);
    expect(a.dependencies).toEqual(['b']);
    expect(b.dependencies).toEqual([]);
    expect(b.calledBy).toEqual(['a']);
  });

  it('dedupes and resets stale edges on re-run', () => {
    const a = makeAgent({ id: 'a', name: 'Alpha', dirPath: '/p/alpha' });
    const b = makeAgent({ id: 'b', name: 'Beta', dirPath: '/p/beta' });
    const agents = [a, b];
    const deps = new Map<string, string[]>(Object.entries({ a: ['Beta', 'beta', 'Beta'], b: ['Alpha', 'Alpha'] }));
    resolveDependencies(agents, deps);
    expect(a.dependencies).toEqual(['b']);
    expect(b.dependencies).toEqual(['a']);
    expect(a.calledBy).toEqual(['b']);
    expect(b.calledBy).toEqual(['a']);
  });
});
