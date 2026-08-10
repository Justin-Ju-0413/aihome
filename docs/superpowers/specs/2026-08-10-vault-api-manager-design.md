# AIHome AI API 管理器（Vault + 工具配置中心）设计

> 2026-08-10。目标：AIHome 新增「AI API 管理器」——集中安全存储各家 API key，并一键把 key/模型配置写入 Claude Code / Codex / opencode 等工具，替代手动改配置与 cc-switch 的配置切换职责；vault 激活状态同时成为 usage 模块的 provider 归属源。

## 1. 背景与现状

- AIHome 现有 usage 模块从 5 个来源（cc-switch / claude / codex / opencode / hermes）读用量日志做成本聚合，但 **没有任何统一管理 API key 的能力**；配置分散在各工具自己的文件里，切换 provider 要么手改文件、要么依赖外部工具（cc-switch）。
- cc-switch 目前承担「切换 Claude Code/Codex 的 provider」职责，AIHome 只读它的 DB 作为用量源。

## 2. 产品形态与关键决策（已与用户确认）

| 决策点 | 选择 |
|---|---|
| 产品形态 | Key 保险库 + 工具配置中心（非代理网关） |
| Key 注入方式 | 直接写工具配置文件（cc-switch 式），工具无需改造 |
| Key 存储 | 主密码 + AES-256-GCM 加密文件（`~/.aihome/vault.enc`，0600） |
| 支持工具（v1） | Claude Code、Codex、opencode（适配器模式，可扩展） |
| 与 usage 联动 | vault 激活状态成为新 provider 归属源（**并存**，cc-switch 源保留） |
| 落地 | 独立功能，web 形态先上 main（独立导航页），桌面壳完成后自然被包含 |
| 激活语义 | per-tool 独立激活（Claude Code 用 A、Codex 用 B，互不干扰） |
| 依赖 | 零新增运行时依赖（仅 `node:crypto`） |

## 3. 架构与数据模型

### 3.1 模块（`src/lib/vault/`，纯 TS + node:crypto）

```
src/lib/vault/
├── crypto.ts       # scrypt 派生 + AES-256-GCM 加解密（node:crypto）
├── store.ts        # vault.enc 读写、provider CRUD、激活状态持久化
├── providers.ts    # 内置 provider 模板 + 自定义 provider 校验
├── session.ts      # 会话解锁态（内存密钥缓存、TTL、lock）
├── adapters/
│   ├── index.ts        # ToolAdapter 接口 + 注册表 + 备份目录管理
│   ├── claude-code.ts  # ~/.claude/settings.json
│   ├── codex.ts        # ~/.codex/config.toml
│   └── opencode.ts     # ~/.config/opencode/opencode.json
└── index.ts
```

### 3.2 vault 文件（`~/.aihome/vault.enc`，0600，不进 git）

外层（加密信封）：

```jsonc
{
  "version": 1,
  "salt": "<hex>",
  "iv": "<hex>",
  "data": "<AES-256-GCM 密文>"
}
```

内层（密文载荷，明文 JSON）：

```jsonc
{
  "providers": [
    { "id": "p_abc123", "name": "DeepSeek 官方", "baseUrl": "https://api.deepseek.com",
      "model": "deepseek-chat", "apiKey": "<明文>",
      "createdAt": "<iso>", "lastUsedAt": "<iso>" }
  ],
  "activated": { "claude-code": "p_abc123", "codex": null, "opencode": "p_abc123" },
  "lastWritten": { "claude-code": { "path": "~/.claude/settings.json", "fingerprint": "<sha256 of injected env>" } }
}
```

- `activated`：每个工具当前激活的 providerId（null = 未激活，工具用默认配置）
- `lastWritten`：冲突保护用——记录我们上次注入的字段指纹，用于区分「我们写的」和「用户手改的」
- provider `id`：`crypto.randomUUID()` 生成

### 3.3 内置 provider 模板（`providers.ts`）

| id | 名称 | baseUrl | 默认 model |
|---|---|---|---|
| `anthropic` | Anthropic 官方 | `https://api.anthropic.com` | `claude-sonnet-4-6` |
| `openai` | OpenAI | `https://api.openai.com/v1` | `gpt-5.5` |
| `deepseek` | DeepSeek | `https://api.deepseek.com` | `deepseek-v4-flash` |
| `volcengine-coding` | 火山方舟 Coding Plan | `https://ark.cn-beijing.volces.com/api/coding/v3` | `ark-code-latest` |
| `glm` | 智谱 GLM | `https://open.bigmodel.cn/api/paas/v4` | `glm-5.2` |
| `kimi` | Moonshot Kimi | `https://api.moonshot.cn/v1` | `kimi-k2.7-code` |

模板可编辑、可新增自定义 provider（名称/baseUrl/model/apiKey 全自定义）。模板只提供默认值，不限制。

## 4. 安全设计

- **主密码**：首次使用设置（至少 8 位）；不落盘；忘记密码无法恢复（文档明示，无后门）
- **派生**：`scrypt(password, salt, N=2^15)` → 32 字节密钥 → AES-256-GCM 加密/认证（随机 iv per 写）
- **会话**：解锁后密钥存模块级内存 Map，**60 分钟 TTL**（每次成功操作续期）；`POST /api/vault/lock` 立即清零；进程重启即清
- **改密码**：`POST /api/vault/change-password`（需已解锁）→ 旧密码解密 → 新密码重新加密整份文件（换 salt + iv）
- **脱敏**：`apiKey` 永不回传前端；`GET` 响应一律 `masked: "sk-***abc"`（保留尾 4 位）
- **完整性**：AES-GCM 认证失败（文件损坏/篡改/密码错）→ 明确报「文件损坏或密码错误」，不静默重建
- **写入范围**：key 只进 vault.enc 与工具配置文件；不写日志、不进响应体、不进 usage 事件
- **备份文件**：备份的是工具配置文件（含注入的 key 字段）→ `~/.aihome/backups/` 目录设 0600，与 vault.enc 同等对待

## 5. 工具适配器与冲突保护

### 5.1 Adapter 接口

```ts
interface ToolAdapter {
  id: 'claude-code' | 'codex' | 'opencode'
  label: string
  configPath(): string            // 配置文件绝对路径（支持环境变量覆盖，e2e 用）
  detect(): Promise<AdapterState> // 文件状态 + 当前激活 provider + conflict 检测
  activate(p: ProviderConfig, vault: VaultStore): Promise<void>
  deactivate(vault: VaultStore): Promise<void>
}

interface AdapterState {
  fileState: 'ok' | 'missing' | 'conflict' | 'unwritable'
  activeProviderId: string | null   // 从文件反解
  conflictDetail?: string           // conflict 时给出原因
}
```

### 5.2 三工具写语义

| 工具 | 配置文件 | 注入方式 |
|---|---|---|
| Claude Code | `~/.claude/settings.json` | JSON 合并写 `env.ANTHROPIC_BASE_URL` / `env.ANTHROPIC_AUTH_TOKEN` / `env.ANTHROPIC_MODEL`；保留文件其它自定义字段 |
| Codex | `~/.codex/config.toml` | 行级段编辑：替换/插入 `[model_providers.<vaultId>]` 段（name / base_url / env_key）+ `model = "<vaultId>/<model>"` 行；文件其它内容不动（不引入 TOML 依赖） |
| opencode | `~/.config/opencode/opencode.json` | JSON 合并写 `provider.<id>` 自定义 provider 段（baseURL + Authorization header + models 列表，具体段格式实现时对照 opencode 配置文档核对后固化）；保留其它自定义 |

- 配置文件路径全部支持 `AIHOME_VAULT_*_CONFIG` 环境变量覆盖（e2e/CI 用 tmp 目录，绝不触碰真实用户文件——继承项目「测试不碰真实环境」原则）

### 5.3 冲突保护（核心承诺）

1. **备份先行**：每次写前复制原文件到 `~/.aihome/backups/<tool>/<ts>.bak`（保留最近 10 份，vault 初始化时清理）
2. **覆盖冲突检测**：注入字段（如 `ANTHROPIC_AUTH_TOKEN`）已存在且值 ≠ 我们上次写入的指纹（`lastWritten`）→ 视为用户手动改过 → 拒绝写入，返回 conflict 而非覆盖
3. **deactivate**：只移除我们注入的字段，不破坏其它内容（JSON 合并天然支持；TOML 段级移除同理）
4. 目标文件不存在 → 按各自格式创建（settings.json 初始 `{}` / config.toml 空 / opencode.json 初始 `{}`）

## 6. API 路由（`/api/vault/*`）

| 路由 | 用途 | 解锁要求 |
|---|---|---|
| `GET /api/vault/status` | 锁状态 + 各工具激活状态（fileState/activeProvider）+ provider 脱敏列表 | 否 |
| `POST /api/vault/unlock` | `{password}` → 建立会话 | 否 |
| `POST /api/vault/lock` | 锁定（清内存密钥） | — |
| `POST /api/vault/change-password` | `{oldPassword, newPassword}` → 重加密 | 是（且校验 old） |
| `POST /api/vault/providers` | 新增/更新 provider（`{id?, name, baseUrl, model, apiKey}`） | 是 |
| `DELETE /api/vault/providers/[id]` | 删除 provider（先解除激活该 provider 的每个工具） | 是 |
| `POST /api/vault/activate` | `{tool, providerId}` → 写工具配置 | 是 |
| `POST /api/vault/deactivate` | `{tool}` → 移除注入、激活置 null | 是 |

**HTTP 语义**：
- 锁定态写操作 → `423 Locked`
- 密码错 → `401`；文件损坏 → `500`（错误消息固定文案）
- 冲突 → `409 { conflictDetail }`；配置写失败 → `503`
- 全部 JSON 响应，遵循现有 /api 风格

## 7. usage 联动（归属覆盖层）

- 现状：`claude` 源事件 `provider` 硬编码 `'claude-code'`（codex/opencode 源同理），成本按模型匹配 BUNDLED/cc-switch 定价
- 方案：vault 解锁时读取 `activated` 映射（工具 → providerId）。在 indexer 写库**前**，对 `claude / codex / opencode` 三源事件应用覆盖：`event.provider = activated[tool]?.name ?? 原值`（未激活则保持原样）
- 效果：切换 provider 后，工具日志用量自动按激活 provider 的模型价格归属，成本面板随之更新；cc-switch 源完全不动（并存）
- 实现落点：`src/lib/usage/indexer.ts`（scan 后、写库前）；vault 未解锁/无 vault 文件时覆盖为空操作（零行为变化）
- 注意：这是**归属标签覆盖**，不修改事件 token/模型/cost 字段本身（模型不变，成本仍由 pricing 层算）

## 8. UI（独立导航页 `/vault`）

- 顶部导航（TopNav）新增「API 管理」入口
- **锁定态**：主密码输入框（或「设置主密码」首次引导）→ 解锁后进入管理区
- **Provider 卡片区**：每 provider 一张卡（名称/模型/baseUrl/脱敏 key/编辑/删除）；「+ 添加 Provider」表单（模板下拉 + 自定义）
- **工具状态面板**：三工具各一行——当前激活 provider 徽标、文件状态徽标（ok/missing/conflict/unwritable）、「切换」按钮（激活弹层选 provider）、「还原默认」按钮
- **冲突提示**：fileState=conflict 时红条显示 conflictDetail，按钮置灰
- **配置过期**：更新 provider 的 baseUrl/model 后，已激活该 provider 的工具显示「配置过期」徽标，需重新切换才生效
- **安全操作**：改密码、锁定按钮（页面右上角）
- 解锁会话过期 → 前端自动回到锁定态（401/423 时清本地状态）

## 9. 错误处理汇总

| 场景 | 行为 |
|---|---|
| 密码错 | 401，前端提示「密码错误」 |
| vault.enc 损坏 | 500 固定文案「vault 文件损坏或密码错误」；不自动重建 |
| 工具配置被用户手改 | 409 conflict + 原因；UI 红条；不覆盖 |
| 目标目录不可写 | 503 + 路径 |
| 删除正在激活的 provider | 拒绝（先 deactivate 对应工具） |
| 会话过期 | 423 → 前端回锁定态 |

## 10. 测试策略

- **单测（vitest，tmp 目录隔离，绝不碰真实 `~/.claude` 等）**：
  - `crypto.test.ts`：加解密往返、错误密码认证失败、salt/iv 随机性、改密码后旧密文不可解
  - `store.test.ts`：provider CRUD、激活状态持久化、lastWritten 指纹、文件损坏检测、0600 权限
  - `adapters/*.test.ts`：三工具 activate/deactivate 往返（tmp HOME）、字段保留（自定义字段不动）、冲突检测（手动改值后拒绝）、missing 文件创建、备份生成
  - `providers.test.ts`：模板完整性、自定义校验
  - `session.test.ts`：TTL、lock、续期
  - usage 覆盖：activated 映射覆盖事件 provider、未激活/无 vault 时零变化
- **e2e（PORT=3100，`AIHOME_VAULT_*_CONFIG` 指向 tmp）**：解锁→加 provider→切换→状态徽标→冲突场景→锁定回落
- key 一律假值（`sk-test-...`），无真实密钥进测试

## 11. 不做的事（YAGNI）

- 本地代理端点/网关（用户已排除）
- 用量 quota / 限流 / 账单分摊（vault 不管用量，usage 已独立存在）
- 多用户 / 远程访问（单机信任边界，与现有路由一致）
- 密码找回（加密文件语义上不可恢复）
- v1 支持更多工具（适配器接口预留，后续加 hermes/others）
- 自动轮换 key / key 健康检查（后续需求再评估）

## 12. 验收总览

1. 首次设置主密码 → 加 2 个 provider → 切换 Claude Code → `~/.claude/settings.json` 出现注入字段且自定义字段保留
2. 用户手改注入字段后再次切换 → 409 conflict 提示，文件未被覆盖
3. 还原默认 → 注入字段被移除，其余内容不动；备份文件存在于 `~/.aihome/backups/`
4. 切换 provider 后 usage 页该工具事件按激活 provider 归属（成本变化可观察）
5. 锁定/重启后所有写操作 423；改密码后旧密码失效、新密码可解锁
6. 单测全绿 + e2e 全绿（tmp 隔离）；现有 115 单测 / 110 e2e 不回归
