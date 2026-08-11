import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, '.next', 'standalone');

await mkdir(path.join(out, '.next'), { recursive: true });
await cp(path.join(root, '.next', 'static'), path.join(out, '.next', 'static'), { recursive: true });
await cp(path.join(root, 'public'), path.join(out, 'public'), { recursive: true });

// Next 的 trace 会把整个仓库根拖进 standalone（docs/e2e/src/src-tauri/...）。
// 只保留运行必需项，否则会污染打包资源（dmg 体积 + 编译期内嵌）。
// data/ 保留：desktop 首启默认扫描 cwd/data 的 sample-agents（workspace-config 默认路径）。
const keep = new Set(['server.js', 'node_modules', '.next', 'public', 'data', 'package.json', 'package-lock.json']);
for (const entry of await readdir(out)) {
  if (!keep.has(entry)) {
    await rm(path.join(out, entry), { recursive: true, force: true });
  }
}

// 固定端口与绑定：standalone server.js 默认 0.0.0.0:3000
const serverJs = path.join(out, 'server.js');
const code = await readFile(serverJs, 'utf8');
if (!code.includes("PORT = process.env.PORT")) {
  const inject =
    "process.env.PORT = process.env.PORT || '3010';\n" +
    "process.env.HOSTNAME = process.env.HOSTNAME || '127.0.0.1';\n";
  await writeFile(serverJs, inject + code);
}
console.log('standalone assets copied, port pinned to 3010');
