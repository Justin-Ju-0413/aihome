import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { scanDirectories } from '../scanner';

const tmp = path.join(os.tmpdir(), `aihome-claude-test-${process.pid}`);

async function writeFile(dir: string, name: string, content: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, name), content, 'utf-8');
}

const AGENTS_CONTENT = `# MoneyNote

本地优先的个人记账 PWA。

## Dependencies
- skillhub
`;

const CLAUDE_CONTENT = `# CLAUDE.md

本项目的开发规范见 AGENTS.md。
`;

beforeEach(async () => {
  await fs.mkdir(tmp, { recursive: true });
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe('scanDirectories with CLAUDE.md', () => {
  it('merges CLAUDE.md into same-directory AGENTS.md node with both ruleFiles', async () => {
    await writeFile(path.join(tmp, 'moneynote'), 'AGENTS.md', AGENTS_CONTENT);
    await writeFile(path.join(tmp, 'moneynote'), 'CLAUDE.md', CLAUDE_CONTENT);

    const result = await scanDirectories([tmp]);
    expect(result.agents).toHaveLength(1);
    expect(result.agents[0].name).toBe('MoneyNote');
    expect(result.agents[0].type).toBe('agent');
    expect(result.agents[0].ruleFiles).toEqual(['AGENTS.md', 'CLAUDE.md']);
    expect(result.agents[0].dependencies).toEqual([]); // skillhub 不在扫描范围内
  });

  it('creates standalone agent node when only CLAUDE.md exists', async () => {
    await writeFile(path.join(tmp, 'solo'), 'CLAUDE.md', CLAUDE_CONTENT);

    const result = await scanDirectories([tmp]);
    expect(result.agents).toHaveLength(1);
    expect(result.agents[0].type).toBe('agent');
    expect(result.agents[0].ruleFiles).toEqual(['CLAUDE.md']);
    // CLAUDE_CONTENT 的 H1 为 "# CLAUDE.md"，parseAgentsMd 会将其解析为名称
    expect(result.agents[0].name).toBe('CLAUDE.md');
  });

  it('resolves dependencies for standalone CLAUDE.md node', async () => {
    await writeFile(path.join(tmp, 'solo'), 'CLAUDE.md', `# Solo\n\n## Dependencies\n- target\n`);
    await writeFile(path.join(tmp, 'target'), 'AGENTS.md', `# Target\n\n目标节点。\n`);

    const result = await scanDirectories([tmp]);
    const solo = result.agents.find(a => a.name === 'Solo');
    const target = result.agents.find(a => a.name === 'Target');
    expect(solo).toBeDefined();
    expect(target).toBeDefined();
    expect(solo!.dependencies).toContain(target!.id);
    expect(target!.calledBy).toContain(solo!.id);
  });

  it('keeps SKILL.md nodes with ruleFiles=["SKILL.md"] and agent+skill coexist', async () => {
    await writeFile(path.join(tmp, 'skillhub'), 'SKILL.md', `---\nname: skillhub\n---\n\n# skillhub\n\n技能仓库。\n`);
    await writeFile(path.join(tmp, 'moneynote'), 'AGENTS.md', AGENTS_CONTENT);
    await writeFile(path.join(tmp, 'moneynote'), 'CLAUDE.md', CLAUDE_CONTENT);

    const result = await scanDirectories([tmp]);
    const skill = result.agents.find(a => a.type === 'skill');
    expect(skill?.ruleFiles).toEqual(['SKILL.md']);
    expect(result.agents).toHaveLength(2);
  });

  it('survives broken CLAUDE.md without aborting the scan', async () => {
    await writeFile(path.join(tmp, 'moneynote'), 'AGENTS.md', AGENTS_CONTENT);
    await writeFile(path.join(tmp, 'moneynote'), 'CLAUDE.md', '\u0000broken'); // 无 H1 也能解析，验证不抛错

    const result = await scanDirectories([tmp]);
    expect(result.agents).toHaveLength(1);
    expect(result.agents[0].ruleFiles).toEqual(['AGENTS.md', 'CLAUDE.md']);
  });
});
