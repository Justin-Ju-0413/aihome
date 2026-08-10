import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, '.next', 'standalone');

await mkdir(path.join(out, '.next'), { recursive: true });
await cp(path.join(root, '.next', 'static'), path.join(out, '.next', 'static'), { recursive: true });
await cp(path.join(root, 'public'), path.join(out, 'public'), { recursive: true });

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
