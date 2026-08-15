/** settings 模块文案（英文基准）— 由并行任务填充 */
export const settingsEn = {
  // settings page
  'settings.page.title': 'Settings',
  'settings.page.subtitle': 'Configure workspace and preferences',
  'settings.page.readonlyTitle': 'Read-only demo mode: writes are disabled',
  'settings.page.readonlyMode': 'Read-only mode',
  'settings.page.readonlyBanner':
    'Read-only demo mode: workspace writes are disabled (AIHOME_READONLY or config.readonly)',
  'settings.page.scanPaths': 'Scan Paths',
  'settings.page.scanPathsDesc': 'Directories to scan for Agent and Skill definitions',
  'settings.page.groups': 'Groups',
  'settings.page.groupsDesc': 'Organize agents into groups on the kanban board',
  'settings.page.groupNamePlaceholder': 'Group name',
  'settings.page.about': 'About',
  'settings.page.aboutTagline': 'AIHome - AI Agent Visual Manager',
  'settings.page.aboutVersion': 'Version {version}',
  'settings.page.aboutBuiltWith': 'Built with Next.js, React, and TailwindCSS',
  'settings.page.loadFailed': 'Failed to load config',
  'settings.page.scanFound': 'Found {count} agents',
  'settings.page.scanFailed': 'Scan failed',

  // workbench balance
  'settings.balance.title': 'Workbench Balance',
  'settings.balance.description':
    'Auto-refresh balance queries for configured platform keys (see the Workbench page)',
  'settings.balance.autoRefresh': 'Auto-refresh balance',
  'settings.balance.intervalMin': 'Interval (minutes)',
  'settings.balance.refreshAll': 'Refresh all',
  'settings.balance.restoreBuiltins': 'Restore built-in list',
  'settings.balance.clearKeys': 'Clear all keys',
  'settings.balance.clearConfirm': 'Clear all API keys? This cannot be undone.',
  'settings.balance.loadFailed': 'Failed to load settings',
  'settings.balance.refreshed': 'Refreshed {checked} keys, {ok} succeeded',
  'settings.balance.cleared': 'Cleared {n} keys',
  'settings.balance.restored': 'Restored {n} built-in platforms',
  'settings.balance.storageNote':
    'Keys are stored locally in ~/.aihome/workbench.db; queries run server-side.',
} as const;
