export const toolsEn = {
  // /agents 分区切换
  'tools.tabTools': 'AI Tools',
  'tools.tabMarkdown': 'Markdown Agents',

  // 工具检测分区
  'tools.section.subtitle': '{count} local AI tools detected',
  'tools.section.detectFailed': 'Failed to detect local tools',
  'tools.section.refresh': 'Re-detect',
  'tools.section.detecting': 'Detecting...',

  'tools.kind.cli': 'CLI',
  'tools.kind.app': 'Desktop App',
  'tools.installed': 'Installed',
  'tools.notInstalled': 'Not installed',
  'tools.version': 'Version {version}',
  'tools.config': 'Config',
  'tools.noConfig': 'No config file',
  'tools.binary': 'Binary',

  'tools.provider': 'Active provider',
  'tools.providerNone': 'Default',
  'tools.staleWarning': 'Provider config may be stale',
  'tools.vaultLocked': 'Vault locked',
  'tools.vaultUnlockHint': 'Unlock the vault to see the active provider',
  'tools.goVault': 'Manage',

  'tools.open': 'Open',
  'tools.openFailed': 'Failed to open tool',
  'tools.notAvailable': 'Opening is not supported on this platform',
} as const;

export type ToolsDict = typeof toolsEn;
