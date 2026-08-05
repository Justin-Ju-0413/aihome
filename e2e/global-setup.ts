import * as fs from 'fs';
import * as path from 'path';

const root = path.resolve(__dirname, '..');
const syncRoot = path.join(root, 'e2e', '.e2e-sync');

export default function globalSetup(): void {
  fs.rmSync(syncRoot, { recursive: true, force: true });
  const alpha = path.join(syncRoot, 'alpha');
  const beta = path.join(syncRoot, 'beta');
  const repo = path.join(syncRoot, 'repo');
  const config = path.join(syncRoot, 'config');

  fs.mkdirSync(path.join(alpha, 'foo'), { recursive: true });
  fs.writeFileSync(path.join(alpha, 'foo', 'SKILL.md'), '---\ndescription: foo\n---\n\nv1\n');
  fs.mkdirSync(path.join(beta, 'foo'), { recursive: true });
  fs.writeFileSync(path.join(beta, 'foo', 'SKILL.md'), '---\ndescription: foo\n---\n\nv2-different\n');
  fs.mkdirSync(path.join(beta, 'bar'), { recursive: true });
  fs.writeFileSync(path.join(beta, 'bar', 'SKILL.md'), '---\ndescription: bar\n---\n\nunique\n');

  fs.mkdirSync(config, { recursive: true });
  fs.writeFileSync(
    path.join(config, 'sync-config.json'),
    JSON.stringify({ version: 1, endpoints: { alpha, beta } }, null, 2)
  );
  fs.mkdirSync(repo, { recursive: true });
}
