import { describe, it, expect } from 'vitest';
import { convert, detectTaskType, detectCompositeTasks, getTaskTypes } from '../prompt-converter';

describe('fv prompt-converter', () => {
  it('detects task types by keyword scoring with code_generation default', () => {
    expect(detectTaskType('帮我写一个排序算法')).toBe('code_generation');
    expect(detectTaskType('请审查这段代码质量')).toBe('code_review');
    expect(detectTaskType('修复这个报错')).toBe('debugging');
    expect(detectTaskType('给函数添加文档注释')).toBe('documentation');
    expect(detectTaskType('分析性能瓶颈')).toBe('analysis');
    expect(detectTaskType('补充单元测试覆盖')).toBe('testing');
    expect(detectTaskType('部署到服务器')).toBe('deployment');
    expect(detectTaskType('完全无关的一句话')).toBe('code_generation');
  });

  it('detects composite tasks by Chinese/English separators', () => {
    const parts = detectCompositeTasks('先写代码，然后补充文档');
    expect(parts).not.toBeNull();
    expect(parts).toHaveLength(2);
    expect(parts![0].type).toBe('code_generation');
    expect(parts![1].type).toBe('documentation');

    expect(detectCompositeTasks('review the code and then write tests')).not.toBeNull();
    expect(detectCompositeTasks('单一任务')).toBeNull();
  });

  it('converts per provider with provider-specific prompt styles', () => {
    const claude = convert('写一个函数', 'claude', { target: 'src/a.ts', cwd: '/p' });
    expect(claude.prompt).toContain('<task>');
    expect(claude.prompt).toContain('<target_files>');
    expect(claude.prompt).toContain('<working_directory>');

    const codex = convert('写一个函数', 'codex', { target: 'src/a.ts' });
    expect(codex.prompt).toContain('Target files: src/a.ts');
    expect(codex.prompt).toContain('Implement the above');

    const hermes = convert('写一个函数', 'hermes', { skill: 'coding' });
    expect(hermes.prompt).toContain('[skill:coding]');
  });

  it('returns task metadata in convert result', () => {
    const r = convert('写一个函数', 'claude');
    expect(r.taskType).toBe('code_generation');
    expect(r.taskLabel).toBe('代码生成');
    expect(r.taskIcon).toBe('✨');
    expect(r.originalTask).toBe('写一个函数');
  });

  it('lists task types for UI', () => {
    const types = getTaskTypes();
    expect(types.length).toBeGreaterThanOrEqual(8);
    expect(types[0]).toHaveProperty('id');
    expect(types[0]).toHaveProperty('keywords');
  });
});
