import * as fs from 'fs';
import { stmts } from './db';

interface SettingDef {
  value: string | number;
  category: string;
  type: 'select' | 'toggle' | 'text' | 'range';
  label: string;
  desc: string;
  options?: string[];
  min?: number;
  max?: number;
  validate?: 'path' | 'directory' | 'port' | 'range';
}

export const DEFAULTS: Record<string, SettingDef> = {
  // ===== 外观 (appearance) =====
  'appearance.theme': { value: 'dark', category: 'appearance', type: 'select', options: ['dark', 'light', 'system'], label: '主题模式', desc: '选择界面主题' },
  'appearance.accent_color': { value: 'indigo', category: 'appearance', type: 'select', options: ['indigo', 'purple', 'emerald', 'sky', 'amber', 'rose'], label: '主题色', desc: '界面强调色' },
  'appearance.font_size': { value: '14', category: 'appearance', type: 'select', options: ['12', '13', '14', '15', '16'], label: '字体大小', desc: '界面正文字号(px)' },
  'appearance.sidebar_width': { value: '260', category: 'appearance', type: 'range', min: 200, max: 400, label: '侧栏宽度', desc: '左侧文件树面板宽度(px)', validate: 'range' },
  'appearance.animations': { value: 'true', category: 'appearance', type: 'toggle', label: '动画效果', desc: '启用界面过渡和微交互动画' },
  'appearance.code_wrap': { value: 'true', category: 'appearance', type: 'toggle', label: '代码自动换行', desc: '代码预览区域自动换行' },
  'appearance.file_preview_lines': { value: '25', category: 'appearance', type: 'range', min: 5, max: 100, label: '文件预览行数', desc: '文件详情预览显示的行数', validate: 'range' },
  'appearance.agent_activity_count': { value: '6', category: 'appearance', type: 'range', min: 2, max: 20, label: 'Agent活动条数', desc: 'Agent卡片上显示的最近活动数量', validate: 'range' },
  'appearance.default_tab': { value: 'files', category: 'appearance', type: 'select', options: ['files', 'agents', 'pipelines', 'dashboard', 'hermes', 'match', 'history'], label: '默认标签页', desc: '启动时显示的标签页' },

  // ===== Agent (agent) =====
  'agent.default_provider': { value: 'claude', category: 'agent', type: 'select', options: ['claude', 'codex', 'hermes'], label: '默认 Provider', desc: '创建 Agent 时默认选择的 AI 提供者' },
  'agent.auto_start': { value: 'true', category: 'agent', type: 'toggle', label: '自动启动', desc: '创建 Agent 后自动开始执行' },
  'agent.max_concurrent': { value: '3', category: 'agent', type: 'range', min: 1, max: 10, label: '最大并发数', desc: '同时运行的最大 Agent 数量', validate: 'range' },
  'agent.snapshot_on_start': { value: 'true', category: 'agent', type: 'toggle', label: '启动时快照', desc: 'Agent 启动前自动对目标文件创建快照' },
  'agent.stream_output': { value: 'true', category: 'agent', type: 'toggle', label: '流式输出', desc: '实时显示 Agent 输出（关闭则仅显示最终结果）' },
  'agent.step_detection': { value: 'true', category: 'agent', type: 'toggle', label: '步骤自动检测', desc: '自动检测输出中的关键词推进步骤进度' },
  'agent.refresh_interval': { value: '5', category: 'agent', type: 'select', options: ['2', '3', '5', '10', '15', '30'], label: '状态刷新间隔(秒)', desc: 'Agent 状态轮询间隔' },
  'agent.max_running_progress': { value: '95', category: 'agent', type: 'range', min: 50, max: 99, label: '运行中进度上限(%)', desc: 'Agent 运行时进度条最高值', validate: 'range' },
  'agent.pipeline_step_delay': { value: '500', category: 'agent', type: 'range', min: 100, max: 5000, label: '流水线步骤延迟(ms)', desc: '流水线步骤衔接延迟', validate: 'range' },
  'agent.claude_default_model': { value: 'claude-sonnet-4-20250514', category: 'agent', type: 'text', label: 'Claude 默认模型', desc: '调度器为 Claude 选择的默认模型' },
  'agent.codex_default_model': { value: 'codex-mini', category: 'agent', type: 'text', label: 'Codex 默认模型', desc: '调度器为 Codex 选择的默认模型' },

  // ===== 工作区 (workspace) =====
  'workspace.default_dir': { value: process.cwd(), category: 'workspace', type: 'text', label: '默认工作目录', desc: '启动时扫描的根目录路径', validate: 'directory' },
  'workspace.watch_files': { value: 'true', category: 'workspace', type: 'toggle', label: '文件实时监听', desc: '使用 chokidar 监听文件变化并实时推送' },
  'workspace.watch_ignore': { value: 'node_modules,.git,dist,build,.next', category: 'workspace', type: 'text', label: '忽略目录', desc: '文件监听时忽略的目录(逗号分隔)' },
  'workspace.auto_refresh': { value: '15', category: 'workspace', type: 'select', options: ['5', '10', '15', '30', '60', 'off'], label: '文件树刷新间隔(秒)', desc: '定时刷新文件树的间隔，off为不自动刷新' },
  'workspace.show_hidden': { value: 'false', category: 'workspace', type: 'toggle', label: '显示隐藏文件', desc: '文件树中显示以 . 开头的文件和目录' },
  'workspace.max_scan_depth': { value: '5', category: 'workspace', type: 'range', min: 1, max: 20, label: '最大扫描深度', desc: '文件树最大递归深度', validate: 'range' },
  'workspace.max_file_read_size': { value: '512', category: 'workspace', type: 'range', min: 64, max: 2048, label: '文件读取上限(KB)', desc: '单文件内容读取的最大大小', validate: 'range' },
  'workspace.write_stability_threshold': { value: '300', category: 'workspace', type: 'range', min: 50, max: 2000, label: '写入稳定阈值(ms)', desc: '文件监听写入稳定判定时间', validate: 'range' },
  'workspace.write_poll_interval': { value: '100', category: 'workspace', type: 'range', min: 10, max: 1000, label: '写入轮询间隔(ms)', desc: '文件监听写入轮询间隔', validate: 'range' },

  // ===== 连接 (connection) =====
  'connection.server_port': { value: '3210', category: 'connection', type: 'text', label: '服务端口', desc: 'FileVision 服务监听端口（需重启生效）', validate: 'port' },
  'connection.max_request_size': { value: '10', category: 'connection', type: 'range', min: 1, max: 100, label: '请求体上限(MB)', desc: 'HTTP 请求体最大大小', validate: 'range' },
  'connection.ws_reconnect_interval': { value: '3000', category: 'connection', type: 'range', min: 500, max: 30000, label: 'WS重连间隔(ms)', desc: 'WebSocket 断开后重连间隔', validate: 'range' },
  'connection.claude_path': { value: 'claude', category: 'connection', type: 'text', label: 'Claude CLI 路径', desc: 'Claude Code 可执行文件路径', validate: 'path' },
  'connection.codex_path': { value: 'codex', category: 'connection', type: 'text', label: 'Codex CLI 路径', desc: 'OpenAI Codex CLI 可执行文件路径', validate: 'path' },
  'connection.hermes_enabled': { value: 'true', category: 'connection', type: 'toggle', label: '启用 Hermes 集成', desc: '启用 Hermes Agent 面板和桥接功能' },
  'connection.hermes_cli_path': { value: 'hermes', category: 'connection', type: 'text', label: 'Hermes CLI 路径', desc: 'Hermes 可执行文件路径', validate: 'path' },
  'connection.hermes_home_dir': { value: '', category: 'connection', type: 'text', label: 'Hermes HOME 目录', desc: 'Hermes 运行时主目录（默认 ~/.hermes/）', validate: 'directory' },
  'connection.hermes_default_model': { value: '', category: 'connection', type: 'text', label: 'Hermes 默认模型', desc: '启动 Hermes 会话时使用的默认模型' },
  'connection.hermes_skill_filter': { value: '', category: 'connection', type: 'text', label: 'Hermes 技能过滤', desc: '仅显示指定分类的技能（逗号分隔）' },
  'connection.hermes_auto_refresh': { value: '30', category: 'connection', type: 'select', options: ['10', '15', '30', '60', 'off'], label: 'Hermes刷新间隔(秒)', desc: 'Hermes 面板自动刷新间隔' },
  'connection.hermes_max_output_lines': { value: '500', category: 'connection', type: 'range', min: 100, max: 2000, label: 'Hermes最大输出行数', desc: '实时输出面板保留的最大行数', validate: 'range' },
  'connection.hermes_launch_timeout': { value: '300', category: 'connection', type: 'range', min: 30, max: 3600, label: 'Hermes启动超时(秒)', desc: 'Hermes 进程启动超时时间', validate: 'range' },

  // ===== 通知与隐私 (privacy) =====
  'notification.agent_complete': { value: 'true', category: 'privacy', type: 'toggle', label: 'Agent 完成通知', desc: 'Agent 执行完成时显示通知' },
  'notification.agent_error': { value: 'true', category: 'privacy', type: 'toggle', label: 'Agent 错误通知', desc: 'Agent 执行出错时显示通知' },
  'notification.pipeline_advance': { value: 'true', category: 'privacy', type: 'toggle', label: '流水线推进通知', desc: '流水线步骤切换时显示通知' },
  'notification.file_change': { value: 'false', category: 'privacy', type: 'toggle', label: '文件变化通知', desc: '文件被修改时显示通知' },
  'notification.sound': { value: 'false', category: 'privacy', type: 'toggle', label: '提示音', desc: '通知时播放提示音' },
  'notification.desktop': { value: 'false', category: 'privacy', type: 'toggle', label: '桌面通知', desc: '使用系统通知API发送桌面通知' },
  'privacy.analytics': { value: 'false', category: 'privacy', type: 'toggle', label: '使用分析', desc: '收集匿名使用数据以改进产品（不上传任何代码内容）' },
  'privacy.crash_report': { value: 'true', category: 'privacy', type: 'toggle', label: '崩溃报告', desc: '发生错误时自动发送崩溃信息' },
  'privacy.persist_history': { value: 'true', category: 'privacy', type: 'toggle', label: '持久化历史', desc: '将操作历史保存到本地数据库' },
  'privacy.history_retention': { value: '90', category: 'privacy', type: 'select', options: ['7', '30', '90', '365', 'forever'], label: '历史保留天数', desc: '超过该天数的历史记录将被自动清理' },
  'privacy.clear_on_exit': { value: 'false', category: 'privacy', type: 'toggle', label: '退出时清除', desc: '关闭服务时自动清除所有运行时数据' },
};

export function initDefaults(): void {
  for (const [key, config] of Object.entries(DEFAULTS)) {
    if (!stmts.getSetting(key)) {
      stmts.upsertSetting({ key, value: String(config.value), category: config.category });
    }
  }
}

export function getSetting(key: string): { key: string; value: string; category: string; meta: SettingDef | null } | null {
  const row = stmts.getSetting(key);
  const def = DEFAULTS[key];
  if (!row && !def) return null;
  return {
    key,
    value: row ? String(row.value) : String(def?.value ?? ''),
    category: row ? String(row.category) : def?.category ?? 'general',
    meta: def ?? null,
  };
}

export function setSetting(key: string, value: string): { key: string; value: string; category: string } {
  const def = DEFAULTS[key];
  const category = def?.category ?? 'general';
  stmts.upsertSetting({ key, value: String(value), category });
  return { key, value: String(value), category };
}

export function listAll(): Array<Record<string, unknown>> {
  const rows = stmts.listSettings();
  const map: Record<string, string> = {};
  for (const r of rows) map[String(r.key)] = String(r.value);
  const result: Array<Record<string, unknown>> = [];
  for (const [key, def] of Object.entries(DEFAULTS)) {
    result.push({
      key,
      value: map[key] !== undefined ? map[key] : String(def.value),
      category: def.category,
      type: def.type,
      label: def.label,
      desc: def.desc,
      options: def.options,
      min: def.min,
      max: def.max,
    });
  }
  return result;
}

export function listByCategory(category: string): Array<Record<string, unknown>> {
  return listAll().filter((s) => s.category === category);
}

export function getCategories(): Array<{ id: string; name: string; icon: string }> {
  return [
    { id: 'appearance', name: '外观与界面', icon: '🎨' },
    { id: 'agent', name: 'Agent 与调度', icon: '🤖' },
    { id: 'workspace', name: '工作区与文件', icon: '📁' },
    { id: 'connection', name: '连接与路径', icon: '🔌' },
    { id: 'privacy', name: '通知与隐私', icon: '🔒' },
  ];
}

export function getValues(): Record<string, string> {
  const rows = stmts.listSettings();
  const map: Record<string, string> = {};
  for (const r of rows) map[String(r.key)] = String(r.value);
  const result: Record<string, string> = {};
  for (const [key, def] of Object.entries(DEFAULTS)) {
    result[key] = map[key] !== undefined ? map[key] : String(def.value);
  }
  return result;
}

export function resetAll(): void {
  for (const [key, def] of Object.entries(DEFAULTS)) {
    stmts.upsertSetting({ key, value: String(def.value), category: def.category });
  }
}

export function validateSetting(key: string, value: unknown): { valid: boolean; error?: string } {
  const def = DEFAULTS[key];
  if (!def) return { valid: false, error: '未知设置项' };
  const v = String(value);
  switch (def.validate) {
    case 'path': {
      if (!v || v.trim() === '') return { valid: true };
      try {
        fs.accessSync(v, fs.constants.X_OK);
        return { valid: true };
      } catch {
        return { valid: false, error: `路径 "${v}" 不可执行` };
      }
    }
    case 'directory': {
      if (!v || v.trim() === '') return { valid: true };
      if (!fs.existsSync(v)) return { valid: false, error: `目录 "${v}" 不存在` };
      if (!fs.statSync(v).isDirectory()) return { valid: false, error: `"${v}" 不是目录` };
      return { valid: true };
    }
    case 'port': {
      const n = parseInt(v);
      if (isNaN(n) || n < 1 || n > 65535) return { valid: false, error: '端口须为 1-65535 的整数' };
      return { valid: true };
    }
    case 'range': {
      const n = parseInt(v);
      if (isNaN(n) || (def.min !== undefined && n < def.min) || (def.max !== undefined && n > def.max))
        return { valid: false, error: `值须在 ${def.min ?? '-∞'} ~ ${def.max ?? '+∞'} 之间` };
      return { valid: true };
    }
    default:
      return { valid: true };
  }
}

export function exportSettings(): Record<string, unknown> {
  const values = getValues();
  const meta: Record<string, unknown> = {};
  for (const [key, def] of Object.entries(DEFAULTS)) {
    meta[key] = { category: def.category, type: def.type, label: def.label };
  }
  return { version: 1, exportedAt: new Date().toISOString(), values, meta };
}

export function importSettings(data: Record<string, unknown>): Record<string, unknown> {
  const values = data?.values;
  if (!values || typeof values !== 'object') return { error: '无效的设置数据格式' };
  const results: { imported: number; skipped: number; errors: Array<{ key: string; error: string }> } = {
    imported: 0, skipped: 0, errors: [],
  };
  for (const [key, value] of Object.entries(values as Record<string, unknown>)) {
    if (!DEFAULTS[key]) {
      results.skipped++;
      continue;
    }
    const validation = validateSetting(key, value);
    if (!validation.valid) {
      results.errors.push({ key, error: validation.error ?? 'invalid' });
      results.skipped++;
      continue;
    }
    stmts.upsertSetting({ key, value: String(value), category: DEFAULTS[key].category });
    results.imported++;
  }
  return results;
}
