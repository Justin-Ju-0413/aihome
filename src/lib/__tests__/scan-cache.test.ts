// src/lib/__tests__/scan-cache.test.ts
import { describe, it, expect } from 'vitest';
import type { AgentNode } from '../types';
import { ScanCache } from '../scan-cache';

describe('ScanCache', () => {
  it('fingerprint 反映 mtimeMs 与 size 两者', () => {
    const c = new ScanCache();
    const f1 = c.fileFingerprint({ mtimeMs: 100, size: 10 });
    const f2 = c.fileFingerprint({ mtimeMs: 101, size: 10 });
    const f3 = c.fileFingerprint({ mtimeMs: 100, size: 11 });
    expect(f1).toEqual({ mtimeMs: 100, size: 10 });
    expect(f1).not.toEqual(f2);
    expect(f1).not.toEqual(f3);
  });

  it('未命中返回 null 并计一次 miss', () => {
    const c = new ScanCache();
    expect(c.getFile('/a/AGENTS.md', { mtimeMs: 1, size: 2 })).toBeNull();
    expect(c.stats.cacheMisses).toBe(1);
  });

  it('命中返回浅拷贝，内部返回对象不被外部修改影响', () => {
    const c = new ScanCache();
    const node: AgentNode = {
      id: 'x', name: 'X', type: 'agent', ruleFiles: ['AGENTS.md'], description: '',
      filePath: '/a', dirPath: '/a', status: 'active', associatedFiles: { scripts: 0, references: 0, assets: 0, rules: 0, total: 0 },
      dependencies: [] as string[], calledBy: [] as string[], group: 'default',
      position: { x: 0, y: 0 }, createdAt: '', updatedAt: '',
    };
    c.setFile('/a/AGENTS.md', { mtimeMs: 1, size: 2 }, { node, depNames: ['skill'] });
    const hit = c.getFile('/a/AGENTS.md', { mtimeMs: 1, size: 2 });
    expect(hit).not.toBeNull();
    expect(hit!.depNames).toEqual(['skill']);
    hit!.node.dependencies.push('lucky');        // 污染返回值
    const second = c.getFile('/a/AGENTS.md', { mtimeMs: 1, size: 2 });
    expect(second!.node.dependencies).toEqual([]);  // 缓存内部保持干净
    expect(second!.node).not.toBe(node);
  });

  it('指纹变化后命中失败', () => {
    const c = new ScanCache();
    c.setFile('/a/SKILL.md', { mtimeMs: 1, size: 2 }, { node: {} as never, depNames: [] });
    expect(c.getFile('/a/SKILL.md', { mtimeMs: 9, size: 2 })).toBeNull();
  });

  it('目录统计按 dirMtimeMs 失效', () => {
    const c = new ScanCache();
    expect(c.getDir('/d', 100)).toBeNull();
    c.setDir('/d', 100, { count: { scripts: 1, references: 0, assets: 0, rules: 0, total: 1 } });
    const hit = c.getDir('/d', 100);
    expect(hit).not.toBeNull();
    expect(hit!.count.scripts).toBe(1);
    expect(c.getDir('/d', 101)).toBeNull();
  });

  it('统计字段累积正确', () => {
    const c = new ScanCache();
    c.setFile('/a', { mtimeMs: 1, size: 2 }, { node: { name: 'a' } as never, depNames: [] });
    c.getFile('/a', { mtimeMs: 1, size: 2 });
    c.getFile('/missing', { mtimeMs: 1, size: 2 });
    expect(c.stats.filesChecked).toBe(2);   // getFile 每次计入，setFile 不计
    expect(c.stats.cacheHits).toBe(1);
    expect(c.stats.cacheMisses).toBe(1);
  });
});