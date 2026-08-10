# AIHome Desktop Shell (P0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> 设计文档：`docs/superpowers/specs/2026-08-10-aihome-desktop-design.md`（§3 P0）

**Goal:** 把 AIHome 打包成可双击运行的 macOS 桌面应用：Tauri 2 壳 + Next.js standalone 本地服务。

**Architecture:** Tauri 2 壳负责窗口/托盘/进程生命周期，启动时 spawn `node .next/standalone/server.js`（cwd 必须是 standalone 目录），轮询 `/api/health` 就绪后开主窗口加载 `http://127.0.0.1:3010`，退出时杀子进程。现有 web 功能与测试完全不动。

**Tech Stack:** Tauri 2（Rust）、Next.js 16 standalone、TypeScript、Vitest、Playwright。

## Global Constraints

- 端口固定 **3010**，仅绑定 127.0.0.1
- 现有 115 单测 / 110 e2e 保持全绿（web 形态回归基线）；e2e 用 `PORT=3100` 跑
- 破坏性操作（装 Rust 工具链、归档仓库、删文件）执行前必须用户确认
- 不修改用户环境（PATH/系统配置）；Rust 安装方式由用户选择（Task 2 GATE）
- 提交信息风格：`feat(desktop): ...` / `docs: ...`（参考 `git log --oneline -10`）

---

### Task 1: `/api/health` 路由 + standalone 构建配置

**Files:**
- Create: `src/app/api/health/route.ts`
- Create: `scripts/copy-standalone-assets.mjs`
- Modify: `next.config.ts`（加 `output: 'standalone'`）
- Modify: `package.json`（加 `build:standalone` script）
- Test: `src/lib/__tests__/health-route.test.ts`

**Interfaces:**
- Consumes: 无（独立）
- Produces: `GET /api/health` → `{ ok: true, version: '0.2.0' }`（Task 4 轮询用）；`scripts/copy-standalone-assets.mjs`（Task 5 打包用）

- [x] **Step 1: 写失败测试**

```typescript
// src/lib/__tests__/health-route.test.ts
import { describe, expect, it } from 'vitest';
import { GET } from '../../app/api/health/route';

describe('GET /api/health', () => {
  it('returns ok with version', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(typeof body.version).toBe('string');
  });
});
```

- [x] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/lib/__tests__/health-route.test.ts`
Expected: FAIL（模块不存在）

- [x] **Step 3: 实现**

```typescript
// src/app/api/health/route.ts
import { NextResponse } from 'next/server';
import pkg from '../../../../package.json';

export async function GET() {
  return NextResponse.json({ ok: true, version: pkg.version });
}
```

- [x] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/lib/__tests__/health-route.test.ts`
Expected: PASS

- [x] **Step 5: 配置 standalone 构建**

修改 `next.config.ts`：
```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
};

export default nextConfig;
```

创建 `scripts/copy-standalone-assets.mjs`（Next standalone 不自动复制 static/public，且需注入端口绑定）：
```javascript
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
```

`package.json` scripts 加：
```json
"build:standalone": "next build && node scripts/copy-standalone-assets.mjs"
```

- [x] **Step 6: 验证 standalone 构建**

Run: `npm run build:standalone`
Expected: `.next/standalone/server.js` 存在，`.next/standalone/.next/static` 与 `.next/standalone/public` 非空

- [x] **Step 7: 回归**

Run: `npm run lint` + `npx tsc --noEmit`
Expected: 0 error

- [x] **Step 8: Commit**

```bash
git add next.config.ts package.json scripts/copy-standalone-assets.mjs src/app/api/health/route.ts src/lib/__tests__/health-route.test.ts
git commit -m "feat(desktop): standalone build config + health route"
```

---

### Task 2: Rust 工具链安装（GATE — 需用户确认，不自动执行）

**Files:** 无（环境操作，规则 23 不修改用户环境，需先问）

**Interfaces:**
- Consumes: 无
- Produces: 可用的 `cargo`/`rustc`（Task 3 前置）

- [x] **Step 1: 向用户呈现安装方案，等待选择**

方案 A（推荐，homebrew 用户）：`brew install rustup-init && rustup-init -y --default-toolchain stable`
方案 B：rustup 官方脚本 `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`

**必须等用户明确选择后才执行。**

- [x] **Step 2: 安装并验证**

Run: `cargo --version && rustc --version`
Expected: 两个版本号输出

- [x] **Step 3: 记录（空提交，仅留痕）**

```bash
git commit --allow-empty -m "chore(desktop): rust toolchain installed ($(cargo --version | awk '{print $2}'))"
```

---

### Task 3: Tauri 2 工程脚手架 + 主窗口

**Files:**
- Create: `src-tauri/Cargo.toml`
- Create: `src-tauri/tauri.conf.json`
- Create: `src-tauri/build.rs`
- Create: `src-tauri/src/main.rs`
- Create: `src-tauri/src/lib.rs`
- Create: `src-tauri/capabilities/default.json`
- Create: `src-tauri/icons/`（tray.png、icon.png，见 Step 6）
- Modify: `.gitignore`（`/src-tauri/target/`、`/standalone-resources/`）

**Interfaces:**
- Consumes: Rust 工具链（Task 2）
- Produces: `cargo run` 可启动的壳（主窗口加载 `http://127.0.0.1:3010`）；`src-tauri/src/lib.rs` 的 `run()`（Task 4 注入进程管理）

- [x] **Step 1: 写 Cargo.toml**

```toml
[package]
name = "aihome"
version = "0.3.0"
description = "AIHome desktop"
edition = "2021"

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = ["tray-icon"] }
tauri-plugin-autostart = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
```

- [x] **Step 2: 写 tauri.conf.json**

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "AIHome",
  "version": "0.3.0",
  "identifier": "com.justinju.aihome",
  "build": {
    "beforeDevCommand": "",
    "beforeBuildCommand": "",
    "frontendDist": "../standalone-resources"
  },
  "app": {
    "windows": [
      {
        "label": "main",
        "title": "AIHome",
        "url": "http://127.0.0.1:3010",
        "width": 1280,
        "height": 800,
        "minWidth": 1024,
        "minHeight": 640
      }
    ],
    "security": {
      "csp": "default-src 'self'; connect-src http://127.0.0.1:3010; style-src 'self' 'unsafe-inline'; img-src 'self' data:"
    },
    "trayIcon": { "id": "main-tray", "iconPath": "icons/tray.png", "tooltip": "AIHome" }
  },
  "bundle": {
    "active": true,
    "targets": ["dmg"],
    "category": "DeveloperTool",
    "shortDescription": "Agent ecosystem workspace"
  }
}
```

- [x] **Step 3: 写 build.rs 与 capabilities**

`src-tauri/build.rs`：
```rust
fn main() {
    tauri_build::build()
}
```

`src-tauri/capabilities/default.json`：
```json
{
  "identifier": "default",
  "windows": ["main"],
  "permissions": ["core:default", "autostart:default"]
}
```

- [x] **Step 4: 写 main.rs 与 lib.rs（最小壳 + 托盘）**

`src-tauri/src/main.rs`：
```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    aihome_lib::run();
}
```

`src-tauri/src/lib.rs`：
```rust
use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .setup(|app| {
            let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&quit])?;
            let _tray = TrayIconBuilder::with_id("main-tray")
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => app.exit(0),
                    _ => {}
                })
                .build(app)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [x] **Step 5: 图标（macOS 打包必需）**

准备一张 1024×1024 PNG（可用 `.github/persona-banner.svg` 转 PNG，或 `sips` 从任意图缩放），然后：
```bash
npx @tauri-apps/cli icon /path/to/icon-1024.png --output src-tauri/icons
```
（`npx` 自动拉取 tauri-cli；`tauri icon` 会生成 `icons/` 全套，含 tray/icon）

- [x] **Step 6: .gitignore 追加**

```
/src-tauri/target/
/standalone-resources/
```

- [x] **Step 7: 编译验证**

Run: `cargo build --manifest-path src-tauri/Cargo.toml`
Expected: 编译成功（首次拉 crate 较慢，可 `cargo build` 等待）

- [x] **Step 8: Commit**

```bash
git add src-tauri/ .gitignore
git commit -m "feat(desktop): tauri scaffold with main window + tray"
```

---

### Task 4: next-server 进程生命周期（Rust）

**Files:**
- Create: `src-tauri/src/server.rs`
- Modify: `src-tauri/src/lib.rs`（setup 中 spawn + 健康轮询；RunEvent 退出清理）

**Interfaces:**
- Consumes: `GET /api/health`（Task 1）
- Produces: `aihome_lib::run()` 自动管理 next-server；退出无残留进程（Task 5 冒烟验证）

- [x] **Step 1: 写 src-tauri/src/server.rs**

```rust
use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::Path;
use std::process::{Child, Command};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};

const PORT: u16 = 3010;
const HEALTH_URL: &str = "/api/health";

static CHILD: Mutex<Option<Child>> = Mutex::new(None);

pub fn port_in_use() -> bool {
    TcpStream::connect(("127.0.0.1", PORT)).is_ok()
}

pub fn start_next_server(exe_dir: &Path) -> Result<(), String> {
    if port_in_use() {
        return Err(format!(
            "Port {} is already in use. AIHome needs it free.",
            PORT
        ));
    }
    let standalone = exe_dir.join("standalone");
    let server_js = standalone.join("server.js");
    if !server_js.exists() {
        return Err(format!("standalone server not found: {}", server_js.display()));
    }
    let child = Command::new("node")
        .arg(&server_js)
        .current_dir(&standalone)
        .spawn()
        .map_err(|e| format!("failed to spawn next server: {e}"))?;
    *CHILD.lock().unwrap() = Some(child);
    Ok(())
}

pub fn wait_healthy(timeout: Duration) -> Result<(), String> {
    let deadline = Instant::now() + timeout;
    while Instant::now() < deadline {
        if health_check().is_ok() {
            return Ok(());
        }
        thread::sleep(Duration::from_millis(500));
    }
    Err("next server did not become healthy in time".into())
}

fn health_check() -> Result<(), ()> {
    if let Ok(mut stream) = TcpStream::connect(("127.0.0.1", PORT)) {
        let req = format!(
            "GET {} HTTP/1.1\r\nHost: 127.0.0.1:{}\r\nConnection: close\r\n\r\n",
            HEALTH_URL, PORT
        );
        if stream.write_all(req.as_bytes()).is_ok() {
            let mut buf = [0u8; 256];
            if stream.read(&mut buf).map(|n| n > 0).unwrap_or(false) {
                return Ok(());
            }
        }
    }
    Err(())
}

pub fn stop_next_server() {
    if let Some(mut child) = CHILD.lock().unwrap().take() {
        let _ = child.kill();
        let _ = child.wait();
    }
}
```

- [x] **Step 2: 集成到 lib.rs**

```rust
mod server;

use std::time::Duration;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .setup(|app| {
            let exe_dir = app.path().resource_dir().expect("resource dir");
            server::start_next_server(&exe_dir)?;
            server::wait_healthy(Duration::from_secs(30))
                .map_err(|e| Box::<dyn std::error::Error>::from(e))?;

            let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&quit])?;
            let _tray = TrayIconBuilder::with_id("main-tray")
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => app.exit(0),
                    _ => {}
                })
                .build(app)?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        if let tauri::RunEvent::ExitRequested { .. } = event {
            server::stop_next_server();
        }
    });
}
```

- [x] **Step 3: 编译验证**

Run: `cargo build --manifest-path src-tauri/Cargo.toml`
Expected: 编译通过，无 error

> 2026-08-11 修正：Task 3 的 Cargo.toml 缺 `[lib]` 声明，`main.rs` 引用的 `aihome_lib` 从未能链接（Task 3 Step 7 当时实际是失败的，只留下了 build.rs 产物）。已补 `[lib] name = "aihome_lib"`（独立 fix commit）。另外：`tauri::generate_context!` 会在编译期内嵌 `frontendDist` 全部内容——`standalone-resources/` 若带着 Next trace 冗余（整个仓库拷贝）会导致二进制体积失控、链接时磁盘耗尽，须只保留 server.js/node_modules/.next/public。

- [x] **Step 4: 手动集成冒烟（开发联调）**

> 冒烟结果：spawn 成功，4s 内 `/api/health` OK（`{"ok":true,"version":"0.2.0"}`），node 子进程（next-server）正常监听 127.0.0.1:3010，退出后父进程的 `stop_next_server` 清理逻辑已实现。
> ⚠️ 已知限制：**SIGTERM（`kill`、系统注销/关机）不会触发 `RunEvent::ExitRequested`**，node 子进程会泄漏并占住 3010，导致下次启动报 "Port in use"。用户正常退出（托盘"退出"、Cmd+Q、关窗）走 `app.exit(0)` → `ExitRequested` → 正常清理（此路径留待 Task 5 打包后用 `osascript ... quit` 端到端验证）。SIGTERM 加固（信号 handler）为 P0 之外的后续项。

1. 起服务：`npm run build:standalone && node .next/standalone/server.js`（cwd 必须为项目根，因为 server.js 的 `HOSTNAME=0.0.0.0 PORT=3000` 默认——需设置 `PORT=3010 HOSTNAME=127.0.0.1`）
2. 联调时 Tauri 的 resource_dir 是 `target/debug/` 或 bundle 资源——**开发模式**临时方案：在 `src-tauri/target/debug/` 下建 `standalone` 软链指向 `.next/standalone`：`ln -sfn "$(pwd)/.next/standalone" src-tauri/target/debug/standalone`
3. `cargo run --manifest-path src-tauri/Cargo.toml`
4. 验证：主窗口出现并加载 AIHome；`ps aux | grep server.js` 有进程
5. 退出应用 → `ps aux | grep server.js` 无进程

- [x] **Step 5: Commit**

```bash
git add src-tauri/src/server.rs src-tauri/src/lib.rs
git commit -m "feat(desktop): next-server process lifecycle (spawn/health/cleanup)"
```

---

### Task 5: macOS 打包 .dmg + 冒烟验证

**Files:**
- Create: `scripts/smoke-desktop.sh`
- Modify: `src-tauri/tauri.conf.json`（`bundle.resources` 挂 standalone）

**Interfaces:**
- Consumes: Task 3/4 成果
- Produces: `src-tauri/target/release/bundle/dmg/AIHome_0.3.0_*.dmg`；可重复的冒烟脚本

- [ ] **Step 1: tauri.conf.json 挂资源**

`bundle` 节加：
```json
"resources": ["../standalone-resources/standalone"]
```

（端口注入已在 Task 1 的 copy-standalone-assets.mjs 中完成：standalone server.js 固定 `PORT=3010 HOSTNAME=127.0.0.1`）

- [ ] **Step 2: 写冒烟脚本 scripts/smoke-desktop.sh**

```bash
#!/usr/bin/env bash
# 冒烟：standalone → 资源 → release 打包 → 安装 → 启动 → 健康 → 退出 → 无残留
set -euo pipefail
cd "$(dirname "$0")/.."

npm run build:standalone

mkdir -p standalone-resources
rm -rf standalone-resources/standalone
cp -R .next/standalone standalone-resources/

cargo build --release --manifest-path src-tauri/Cargo.toml

DMG=$(ls src-tauri/target/release/bundle/dmg/AIHome_*.dmg | head -1)
echo "DMG: $DMG"

hdiutil attach "$DMG" -quiet -nobrowse -mountpoint /tmp/aihome-mnt
APP=/tmp/aihome-mnt/AIHome.app
open "$APP"
sleep 15
if curl -sf http://127.0.0.1:3010/api/health > /dev/null; then
  echo "PASS: health endpoint reachable"
else
  echo "FAIL: health endpoint not reachable"
  hdiutil detach /tmp/aihome-mnt -quiet
  exit 1
fi

osascript -e 'tell application "AIHome" to quit' || pkill -f AIHome
sleep 3
if pgrep -f "standalone/server.js" > /dev/null; then
  echo "FAIL: next-server still running after quit"
  hdiutil detach /tmp/aihome-mnt -quiet
  exit 1
fi
echo "PASS: no residual process"
hdiutil detach /tmp/aihome-mnt -quiet
echo "SMOKE OK"
```

注意：standalone server 默认监听 `0.0.0.0:3000`。**必须在 standalone 产物中固化端口**：修改构建后 `.next/standalone/server.js` 前加 `process.env.PORT = process.env.PORT || '3010'; process.env.HOSTNAME = process.env.HOSTNAME || '127.0.0.1';`——在 `copy-standalone-assets.mjs` 中追加这段注入逻辑：

```javascript
// 追加到 copy-standalone-assets.mjs 末尾：固定端口与绑定
import { readFile, writeFile } from 'node:fs/promises';
const serverJs = path.join(out, 'server.js');
const code = await readFile(serverJs, 'utf8');
if (!code.includes('PORT = process.env.PORT')) {
  const inject =
    "process.env.PORT = process.env.PORT || '3010';\n" +
    "process.env.HOSTNAME = process.env.HOSTNAME || '127.0.0.1';\n";
  await writeFile(serverJs, inject + code);
}
```

- [ ] **Step 3: 跑冒烟**

Run: `bash scripts/smoke-desktop.sh`
Expected: 两处 PASS + `SMOKE OK`；`.dmg` 文件存在

- [ ] **Step 4: web 回归基线**

Run: `npm test` + `PORT=3100 npx playwright test`
Expected: 115 单测 / 110 e2e 全绿（`output: 'standalone'` 不改变 dev/build 行为）

- [ ] **Step 5: Commit**

```bash
git add scripts/smoke-desktop.sh scripts/copy-standalone-assets.mjs src-tauri/tauri.conf.json
git commit -m "feat(desktop): dmg bundle with standalone resources + smoke script"
```

---

## P0 完成标准

- `bash scripts/smoke-desktop.sh` 全 PASS
- 115 单测 / 110 e2e 全绿
- `.dmg` 双击可用，退出无残留进程
