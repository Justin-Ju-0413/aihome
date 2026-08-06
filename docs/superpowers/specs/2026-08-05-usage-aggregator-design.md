# 设计文档：Usage 超级聚合体（TokenTicker 并入 AIHome）

- 日期：2026-08-05
- 状态：已批准
- 相关仓库：aihome（新功能落地）、ccswitch-usage-widget（TokenTicker，转为重定向）

## 背景与目标

把 TokenTicker（CC Switch 用量 K 线行情终端，Python 桌面版）的功能移植进 AIHome，
并扩展为**多源聚合**的 AI 用量看板——"超级聚合体"。

- TokenTicker 现状：Python/customtkinter 桌面悬浮窗，Windows only，只读 `~/.cc-switch/cc-switch.db`，
  功能为 K 线图（6 档时间范围、OHLC、A 股配色）+ 两级用量表格 + 金额阈值预警。
- AIHome 现状：Next.js 16 本地优先 Web 应用，看板/关系图管理 AGENTS.md/SKILL.md，
  有沙箱文件 API（`/api/files`），跨平台，本地运行无后端服务。
- 合并目标：功能移植成 AIHome 新页面（`/usage`），跨平台，浏览器访问；
  数据源扩展为 CC Switch / Claude Code / Codex / opencode / hermes 五源聚合。
- 仓库策略：新功能全部进 aihome；ccswitch-usage-widget 仓库停止新功能，README 重定向到 aihome。

## 数据源（真实路径已在本机验证）

| 源 | 位置 | 粒度 | 成本来源 |
|---|---|---|---|
| CC Switch | `~/.cc-switch/cc-switch.db`（SQLite） | 每请求 | `total_cost_usd` |
| Claude Code | `~/.claude/projects/**/*.jsonl` | 每 assistant 消息 | 定价表计算（jsonl 无 cost） |
| Codex | `~/.codex/sessions/**/*.jsonl` | 每次响应/turn | rollout 内 cost 字段，缺则定价表 |
| opencode | `~/.local/share/opencode/opencode.db`（SQLite） | 每会话 | `session.cost` |
| hermes | `~/.hermes/state.db`（SQLite） | 每会话 | `estimated_cost_usd` 缺则 `actual_cost_usd` |
| openclaw | `~/.openclaw/state/openclaw.sqlite` | 无 usage 表 | 本期不接入，registry 预留插槽 |

## 架构

```
src/lib/usage/
├── types.ts          UsageEvent 规范化模型
├── pricing.ts        模型定价表（CC Switch model_pricing 优先，内置表回退）
├── indexer.ts        增量扫描器（每源断点续扫）
├── cache.ts          缓存 DB 读写（.aihome/usage-cache.db，better-sqlite3）
└── sources/
    ├── ccswitch.ts  claude.ts  codex.ts
    ├── opencode.ts  hermes.ts
    └── registry.ts  源注册表（预留 openclaw 插槽）

API：/api/usage/events  /api/usage/sources  /api/usage/rescan
页面：/usage（TopNav 新增 USAGE 项）
组件：OverviewCards / KLineChart(canvas) / UsageTable / StatCharts
```

### 规范化事件模型

```ts
interface UsageEvent {
  source: 'cc-switch' | 'claude' | 'codex' | 'opencode' | 'hermes';
  provider: string;            // 供应商/应用标识
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd: number;
  latencyMs?: number;
  sessionId?: string;
  timestamp: number;           // epoch ms
}
```

### 关键流程

1. 适配器从各源本地文件/DB 读原始记录（**只读**，绝不写源文件）。
2. 索引器增量清洗 → 写入缓存 DB，每源记录断点（文件 mtime / MAX 时间戳）。
3. 缓存 DB 以 `(source, rawId)` UNIQUE 去重，幂等可重扫。
4. 页面查询全走缓存聚合，秒开；JSONL 大目录只扫增量。
5. 触发时机：页面加载（超过 5 分钟未扫则后台触发）+ 手动「重新扫描」按钮（POST /api/usage/rescan）。

技术选型：`better-sqlite3`（缓存 DB + 读 CC Switch/opencode/hermes SQLite）；
K 线自绘 canvas 组件，不引图表库重依赖。

## 各源适配器规则

1. **CC Switch**：`proxy_request_logs` 按 `created_at > 断点` 增量；
   `model`/`app_type`→provider、各 token 列直映、`total_cost_usd`→cost、`created_at`→timestamp；
   跳过 `status_code != 200` 的请求。
2. **Claude Code**：逐行解析 JSONL 取 assistant 消息 `usage` 字段；
   cost 由定价表计算；provider="claude-code"；断点按文件 mtime。
3. **Codex**：解析 rollout 中 response/turn 事件的 usage + cost；缺 cost 走定价表；断点按 mtime。
4. **opencode**：`session` 表 `cost`/`tokens_*` 每会话一条事件；断点 `MAX(time_created)`。
5. **hermes**：`sessions` 表 `estimated_cost_usd`（缺则 `actual_cost_usd`）、token 列直映、
   `started_at`→timestamp、`source`→provider；断点 `MAX(started_at)`。
6. **openclaw**：registry 注册枚举，adapter 返回「未接入」，UI 显示数据不可用。

### 定价策略（给缺 cost 的源）

1. CC Switch `model_pricing` 表（本机 188 条）。
2. 内置 fallback 表（常见模型）。
3. 均无 → cost = 0，UI 标注「未计价」。

## UI 布局（/usage 页）

- **聚合总览卡片**（全源合计）：今日 / 本周 / 本月花费、请求数、Token 总数。
- **源筛选**：全部 | CC Switch | Claude | Codex | opencode | hermes；源不可用显示状态徽章，不影响其它源。
- **时间范围**：5m / 15m / 30m / 1h / 24h / 7d / 30d（TokenTicker 6 档 + 30d）。
- **K 线图**：OHLC 画布，A 股风格涨红跌绿，黄框当前 K 线；维度可选金额 / Token；
  OHLC 定义沿用 TokenTicker（桶内首/最大/最小/末），多源按筛选合并后同桶计算。
- **统计图表**：按日柱状图 / 按源占比 / 按模型 Top10。
- **用量表格**：两级层次 agent→model 折叠展开；近 24h + 本月两栏（Token + 金额）；
  金额阈值变色 🟢 <$20 / 🟡 $20–50 / 🔴 ≥$50。
- 交互：源筛选与时间范围联动 K 线/图表/表格；总览始终全源。
- 视觉：与现有页面同款深色风格，复用 Tailwind token；桌面优先，窄屏 K 线横滑。

## 错误处理与安全

- 所有适配器只读源数据；数据源路径硬编码白名单，不接受用户传入路径（不扩大沙箱边界）。
- 缓存 DB 仅写 `.aihome/usage-cache.db`。
- 单源失败隔离：该源标错误徽章，其余源正常。
- 索引器幂等：事务 + UNIQUE 去重，失败不污染缓存。
- JSONL 单行损坏跳过；上游 schema 变更 → 该源降级「不可用」并在 `/api/usage/sources` 返回原因。
- API 与现有模式一致（本地服务，无认证，与 aihome 现状相同）。

## 测试

- **单元（Vitest）**：各适配器 fixture 验证（解析/增量断点/去重）、K 线 OHLC 桶计算与多源合并、定价查找。
- **E2E（Playwright）**：`/usage` 五区块渲染、源/时间范围切换、重新扫描流程、空数据状态。
- **真实数据核对**：本机运行对照 cc-switch 实际数据人工验证。

## 范围外（本期不做）

- openclaw 接入、云同步、多用户、写操作（记账/导出账单）。
- TokenTicker Python 版停止新功能，仓库 README 重定向到 aihome。
