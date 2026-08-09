import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { scanDirectories } from '../scanner';

const tmp = path.join(os.tmpdir(), `aihome-scan-cache-${process.pid}`);

async function writeFile(dir: string, name: string, content: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, name), content, 'utf-8');
}

beforeEach(async () => { await fs.mkdir(tmp, { recursive: true }); });
afterEach(async () => { await fs.rm(tmp, { recursive: true, force: true }); });

describe('scanDirectories with cache', () => {
  it('默认开启缓存，二次扫描全部命中，结果一致', async () => {
    await writeFile(path.join(tmp, 'a'), 'AGENTS.md', '# A\n\n说明。\n');
    await writeFile(path.join(tmp, 'b'), 'SKILL.md', '---\nname: b\n---\n# b\n');
    await fs.mkdir(path.join(tmp, 'a', 'scripts'), { recursive: true });
    await writeFile(path.join(tmp, 'a', 'scripts'), 's1.md', 'x');

    const first = await scanDirectories([tmp]);
    const second = await scanDirectories([tmp]);

    expect(first.agents).toHaveLength(2);
    expect(second.agents).toHaveLength(2);
    expect(second.agents.map(a => a.name).sort()).toEqual(first.agents.map(a => a.name).sort());
    expect(first.scanStats).toBeDefined();
    expect(first.scanStats!.cacheMisses).toBeGreaterThanOrEqual(2);
    expect(first.scanStats!.cacheHits).toBe(0);
    expect(second.scanStats!.cacheHits).toBe(first.scanStats!.cacheMisses);
  });

  it('修改文件后指纹失效并重扫，新内容反映到结果', async () => {
    await writeFile(path.join(tmp, 'a'), 'AGENTS.md', '# One\n\n原说明。\n');
    await scanDirectories([tmp]);
    await writeFile(path.join(tmp, 'a'), 'AGENTS.md', '# Two\n\n改过。\n');
    const after = await scanDirectories([tmp]);
    const a = after.agents.find(x => x.filePath.endsWith('/a/AGENTS.md'));
    expect(a?.name).toBe('Two');
  });

  it('目录统计变化使 associatedFiles 更新', async () => {
    await writeFile(path.join(tmp, 'a'), 'AGENTS.md', '# A\n');
    await fs.mkdir(path.join(tmp, 'a', 'references'), { recursive: true });
    await scanDirectories([tmp]);
    await fs.mkdir(path.join(tmp, 'a', 'references'), { recursive: true });
    await writeFile(path.join(tmp, 'a', 'references'), 'r.md', 'ref');
    const after = await scanDirectories([tmp]);
    const a = after.agents.find(x => x.name === 'A');
    expect(a?.associatedFiles.references).toBe(1);
  });

  it('cache:false 时 scanStats 未定义', async () => {
    await writeFile(path.join(tmp, 'a'), 'AGENTS.md', '# A\n');
    const r = await scanDirectories([tmp], { cache: false });
    expect(r.scanStats).toBeUndefined();
  });

  it('CLAUDE.md 合并逻辑在有缓存时仍成立', async () => {
    await writeFile(path.join(tmp, 'm'), 'AGENTS.md', '# M\n');
    await writeFile(path.join(tmp, 'm'), 'CLAUDE.md', '# CLAUDE.md\n');
    const r = await scanDirectories([tmp]);
    expect(r.agents).toHaveLength(1);
    expect(r.agents[0].ruleFiles).toEqual(['AGENTS.md', 'CLAUDE.md']);
    const r2 = await scanDirectories([tmp]);
    expect(r2.agents[0].ruleFiles).toEqual(['AGENTS.md', 'CLAUDE.md']);
  });
});