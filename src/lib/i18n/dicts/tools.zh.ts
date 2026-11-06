import type { ToolsDict } from './tools.en';

export const toolsZh: Record<keyof ToolsDict, string> = {
  // /agents 分区切换
  'tools.tabTools': 'AI 工具',
  'tools.tabMarkdown': 'Markdown Agents',

  // 工具检测分区
  'tools.section.subtitle': '检测到 {count} 个本机 AI 工具',
  'tools.section.detectFailed': '检测本机工具失败',
  'tools.section.refresh': '重新检测',
  'tools.section.detecting': '检测中...',

  'tools.kind.cli': 'CLI',
  'tools.kind.app': '桌面应用',
  'tools.installed': '已安装',
  'tools.notInstalled': '未安装',
  'tools.version': '版本 {version}',
  'tools.config': '配置',
  'tools.noConfig': '无配置文件',
  'tools.binary': '二进制',

  'tools.provider': '当前 Provider',
  'tools.providerNone': '默认',
  'tools.staleWarning': 'Provider 配置可能已过期',
  'tools.vaultLocked': 'Vault 已锁定',
  'tools.vaultUnlockHint': '解锁 vault 后显示当前 Provider',
  'tools.goVault': '去管理',

  'tools.open': '打开',
  'tools.openFailed': '打开工具失败',
  'tools.notAvailable': '当前平台不支持打开',
};
