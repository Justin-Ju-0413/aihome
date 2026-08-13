# AIHome 桌面化整合设计（Desktop Consolidation Design）

> 2026-08-10。目标：把 AIHome 集成为一个完整可运行的桌面软件——Tauri 桌面壳 + 剩余未合并工具（skillhub 技能注册表）并入，TokenTicker 以悬浮窗形态回归。

## 1. 背景与现状核实

**已完成并入（2026-08-05 至 08-09 期间，均已进 main）**：

| 原项目 | 并入形态 | 现状 |
|---|---|---|
| skill-sync（git 四端同步） | `src/lib/sync/`（checksum/engine/git/metadata/migration/paths/config）+ `/api/sync/*` + 同步页 | ✅ 已合并（M1） |
| TokenTicker 数据逻辑 | usage aggregator：`src/lib/usage/` + `/api/usage/*` + usage 页（K 线/用量表） | ✅ 已合并（PR #5） |

**剩余未合并**：

| 项目 | 技术栈 | 内容 | 处置 |
|---|---|---|---|
| skillhub | Python CLI | symlink 技能注册表 + SQLite 状态 + 平台适配器 | **P1 并入（TS 化）** |
| TokenTicker 桌面形态 | Python 悬浮窗 | always-on-top K 线悬浮窗 | **P2 以 Tauri 悬浮窗回归** |
| （无） | — | 桌面壳 | **P0 Tauri 2 打包** |

**2026-08-05 skill-sync 合并设计文档的 M2（桌面壳评估）至今未实施**——本文档即 M2 的落地，并扩展为三合一整合。

## 2. 产品形态与总体架构

AIHome = 一个可双击运行的桌面软件，做四件事：**看**（看板/图谱/列表）、**改**（Markdown 编辑）、**管**（扫描/分组/健康）、**同步**（git 四端 + symlink 注册表双机制）。

### 架构

```
┌─────────────────────────────────────────────────┐
│  Tauri 2 桌面壳（Rust）                          │
│  ├─ 主窗口：加载 http://127.0.0.1:3010           │
│  ├─ 悬浮窗：TokenTicker 紧凑 K 线（独立透明置顶） │
│  ├─ 系统托盘：显示/隐藏/悬浮窗开关/退出           │
│  ├─ 开机自启：tauri-plugin-autostart             │
│  └─ 特权命令：symlink 同步、registry 读写         │
└──────────────┬──────────────────────────────────┘
               │ HTTP（仅 127.0.0.1:3010 绑定）
┌──────────────▼──────────────────────────────────┐
│  Next.js standalone（现有 AIHome 主体不动）       │
│  ├─ 现有：看板/图谱/列表/详情/设置/usage/同步页    │
│  ├─ 新增：注册表页（/skills）+ 注册表 API         │
│  └─ 悬浮窗数据源：/api/usage/events（复用）       │
└─────────────────────────────────────────────────┘
```

### 关键技术决策

| 决策 | 选择 | 理由 |
|---|---|---|
| 桌面壳 | Tauri 2（非 Electron） | 用户已选；体积小、原生快 |
| Next.js 集成 | **standalone 模式** + Rust 侧 spawn 子进程 | 现有 20+ `/api/*` 路由、115 单测、110 e2e 全保留，风险最低 |
| 端口 | 固定 **3010**，仅绑定 127.0.0.1 | 避开 3000 dev 端口冲突；standalone 默认 localhost |
| 特权边界 | webview 无文件/网络特权；symlink/registry 走 Node fs（服务端校验路径） | 收敛现有 `/api/files` 沙箱风险面；web/桌面同一代码路径 |
| 注册表存储 | `~/.aihome/registry.db`（SQLite） | 与 `~/.aihome/` 运行时状态同根；沿用 PRAGMA user_version 迁移模式 |
| 悬浮窗数据 | 复用 `/api/usage/events` 轮询（30s），不新增 Rust 读库命令 | 现有 API 已提供聚合，最小改动 |
| skillhub 处置 | **并存**两个同步模块（git 四端 + symlink 注册表） | 用户已确认；机制不同，互不干扰 |

## 3. P0 桌面壳（本轮首个交付物）

### 3.1 Tauri 2 工程

- `src-tauri/` 目录：tauri.conf.json（identifier `com.justinju.aihome`、窗口配置、CSP）、Cargo.toml
- 窗口：主窗口 1280×800（min 1024×640），标题 AIHome
- 插件：tauri-plugin-autostart（开机自启）、tauri-plugin-tray（托盘）、tauri-plugin-shell（spawn next server）
- **前置条件：Rust 工具链**（本机未装 cargo/rustc——安装需用户确认，建议 `brew install rustup-init` 或 rustup 官方脚本）

### 3.2 进程生命周期（核心正确性）

```
启动：Tauri main → spawn `node .next/standalone/server.js`（cwd 正确）
     → 轮询 GET /api/health（新增加健康路由）直至 200（超时 30s）
     → 开主窗口 → 加载 http://127.0.0.1:3010
退出：主窗口关闭事件 → 杀 next-server 子进程（含进程树，Windows 用 taskkill /T）→ 退出
异常：端口被占 → 检测占用进程是 AIHome 自己则复用，否则报错提示
```

- standalone 产物需附带 `.next/static` 与 `public/`（Next standalone 不自动复制，需构建脚本处理）
- **打包策略**：standalone 产物自带精简 `node_modules`，整个 standalone 目录作为 Tauri 资源打包；运行时在空闲端口启动（端口冲突检测见下）

### 3.3 新增路由（web 侧）

- `GET /api/health` → `{ ok: true, version }`（Tauri 壳轮询用）

### 3.4 验收

- `npm run build` 产出 standalone + Tauri bundle `.dmg`（macOS）
- 双击启动 → 主窗口加载全部现有功能 → 退出后无残留 next-server 进程
- 现有 115 单测 / 110 e2e（web 形态）保持全绿

## 4. P1 技能注册表（skillhub TS 化）

### 4.1 数据布局

```
~/.aihome/
├── registry.db          # SQLite 注册表
├── skills/              # 规范副本（SKILL.md 单源）
│   └── <skill-id>/SKILL.md
└── config.json          # 启用平台、同步策略
```

| 表 | 字段要点 |
|---|---|
| `skills` | id（slug）、name、description、source_dir、installed_at |
| `platforms` | name、enabled、install_dir |
| `sync_links` | skill_id、platform、target_path、status（linked/broken/conflict）、linked_at |
| `migrations` | user_version（沿用 usage 的 PRAGMA 模式） |

### 4.2 模块（`src/lib/registry/`，纯 TS 零新增运行时依赖）

| 文件 | 职责 |
|---|---|
| `adapters.ts` | PlatformAdapter 接口 + 三平台（claude-code/codex/workbuddy）路径检测（翻译自 skillhub Python） |
| `registry.ts` | SQLite 读写（skills/platforms/sync_links CRUD + 迁移） |
| `sync-engine.ts` | 同步编排：遍历启用平台 → symlink → 状态写入；冲突保护（目标已存在且非注册表链接 → conflict 跳过）；删除级联 |
| `doctor.ts` | 断裂链接检测（readlink 指向源不存在）+ 一键修复 |

- **symlink 执行**：走 Node `fs.symlink/readlink/unlink`（服务端进程内，AIHome 本就是 Node 服务）——**修正**：最初设想 Rust commands，但 web 形态与桌面形态需同一代码路径（e2e 依赖 HTTP），且现有 `/api/files` 沙箱模式已在服务端做路径校验，Node fs 不新增风险面。Rust 侧只负责窗口/托盘/自启/进程生命周期。
- **Windows junction**：适配器层预留接口，P3 评估（本机 macOS 优先验证）
- **冲突保护承诺**：绝不覆盖用户手动安装的目录（skillhub 原语义）

### 4.3 API 路由（`/api/registry/*`）

| 路由 | 用途 |
|---|---|
| `GET /api/registry/skills` | 技能列表 + 各平台同步状态聚合 |
| `POST /api/registry/import` | 从工作区/平台目录导入 SKILL.md → 规范副本 |
| `POST /api/registry/sync` | 全量/单技能同步（支持 `?dryRun=true`） |
| `GET /api/registry/doctor` | 断裂链接报告 |
| `POST /api/registry/doctor/fix` | 修复断裂链接 |
| `DELETE /api/registry/skills/[id]` | 删除技能（级联删链接，不碰平台目录真实内容） |

### 4.4 UI

- 顶部导航加「注册表」页：技能列表（平台同步徽标）、导入、同步按钮（dry-run 预览）、Doctor 面板
- 与看板关系：看板编辑 SKILL.md 内容；注册表管理"分发到平台"——数据源同一份文件

### 4.5 测试

- 单测（`src/lib/registry/*.test.ts`）：registry CRUD、迁移、冲突检测、symlink 往返（tmp fixture）、doctor 断裂检测——全部确定性、tmp 目录隔离
- e2e：注册表页流程（导入→同步→徽标→删除级联）
- **不触碰**真实 `~/.claude/skills` 等用户环境（测试用 tmp 模拟平台目录）

## 5. P2 悬浮窗与桌面集成（TokenTicker 形态回归）

### 5.1 悬浮窗

- 独立 Tauri 窗口：`always-on-top` + 透明 + 无边框 + 可拖动，约 320×480
- 内容：紧凑 K 线 + 用量表（OHLC/涨跌幅/阈值配色 🟢🟡🔴 逻辑从 TokenTicker Python 翻译为 TS 组件）
- 数据：每 30s 轮询 `/api/usage/events`（复用现有 API）
- 加载：同源 `/widget` 静态页（独立 route，无导航）

### 5.2 托盘与自启

- 托盘菜单：显示/隐藏主窗口、悬浮窗开关、开机自启开关、退出
- 自启：tauri-plugin-autostart；设置页新增开关
- 降级：`prefers-reduced-motion` 关闭动画

## 6. P3 收尾

- **旧仓库归档**：skillhub、ccswitch-usage-widget GitHub 仓库 → Settings → Archive（冻结只读）；README 顶部注明「已并入 AIHome」
- **本地旧目录**：skillhub 本地目录保留（不可破坏性删除）；新增合并说明 README
- **清理空目录残留**：`src/app/api/usage/events 2` 等 6 个空目录（Aug 7 复制残留，git 不跟踪、不影响构建）——删除前用户确认
- **版本**：AIHome v0.2.0 → **v0.3.0**（桌面形态 + 注册表 + 悬浮窗；CHANGELOG 同步）
- **文档**：README 桌面版章节 + 截图（主窗口/悬浮窗/注册表页）；2026-08-05 sync 合并设计文档标注 M2 已落地
- **Windows**：打包评估（不做交付承诺）；skillhub Windows junction 逻辑保留但暂不验证

## 7. 不做的事（YAGNI）

- Tier 2 MCP 服务器统一管理（skillhub roadmap 未交付项，暂不并入）
- Cherry Studio / Claude Desktop / VS Code Copilot 平台适配器（P1 只做已有 3 平台）
- 定时自动同步、同步历史可视化、远程协作（沿用 sync 设计 YAGNI）
- Electron 方案（已排除）
- 应用商店发布

## 8. 风险与缓解

| 风险 | 缓解 |
|---|---|
| Rust 工具链未装（环境修改） | P0 开工前用户确认安装方式；只装 rustup 默认 toolchain，不动系统配置 |
| Next standalone 打包细节（static/public 未复制） | 构建脚本显式复制；验收包含首启截图 |
| 端口 3010 被占 | 检测占用进程归属；非 AIHome 进程则报错提示而非强杀 |
| Tauri 侧 spawn 子进程残留 | 退出钩子杀进程树；macOS/Windows 双路径处理 |
| skillhub 行为偏差（TS 翻译） | 单测逐条对照 Python 测试要点（继承 skill-sync M1 经验） |
| 悬浮窗 K 线逻辑偏差 | 用现有 usage API 返回数据做黄金对比测试 |
| e2e 依赖 web 形态 | web e2e 保持独立；桌面壳用冒烟脚本（spawn→health→窗口）验证 |

## 9. 验收总览

1. **P0**：`.dmg` 双击运行，全部现有功能可用，退出无残留进程
2. **P1**：注册表页导入/同步/doctor/删除全流程可用；冲突保护生效（测试验证）
3. **P2**：悬浮窗常驻置顶，K 线与 usage 页数据一致；托盘/自启工作
4. **P3**：旧仓库 archived；文档/版本同步；空目录清理确认
