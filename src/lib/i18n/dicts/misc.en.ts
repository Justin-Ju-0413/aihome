/** misc 模块文案（英文基准）— usage/health/workbench/widget/各对话框/平台卡片/搜索过滤 */

export const miscEn = {
  // usage
  'usage.overviewToday': 'Today',
  'usage.overviewWeek': 'This Week',
  'usage.overviewMonth': 'This Month',
  'usage.overviewRequests': 'Requests',
  'usage.overviewTokens': 'Tokens',
  'usage.pageTitle': 'Usage',
  'usage.loading': 'Loading usage data…',
  'usage.loadFailed': 'Failed to load usage data',
  'usage.refreshed': 'Usage data refreshed',
  'usage.rescanFailed': 'Rescan failed',
  'usage.kline': 'K-line',
  'usage.amount': 'Amount',
  'usage.tokens': 'Tokens',
  'usage.dailySpend': 'Daily Spend',
  'usage.bySource': 'By Source',
  'usage.topModels': 'Top Models',
  'usage.tableAgent': 'Agent',
  'usage.table24hTokens': '24h Tokens',
  'usage.table24hCost': '24h Cost',
  'usage.tableMonthTokens': 'Month Tokens',
  'usage.tableMonthCost': 'Month Cost',
  'usage.unknownPricing': 'Unknown pricing',
  'usage.emptyText': 'No usage data yet — click Rescan after using your AI tools.',

  // health
  'health.title': 'Workspace Health',
  'health.subtitle': 'Checks the workspace: unreadable paths, scan/parse errors, duplicate agents.',
  'health.recheck': 'Re-check',
  'health.allGood': 'All good',
  'health.fetchFailed': 'Unable to fetch health status',
  'health.unreadablePath': 'Unreadable path',
  'health.scanError': 'Scan/parse error',
  'health.duplicateAgent': 'Duplicate agent',

  // workbench
  'workbench.addPlatform': 'Add platform',
  'workbench.editPlatform': 'Edit platform',
  'workbench.loading': 'Loading…',
  'workbench.noMatch': 'No matching platforms',
  'workbench.nameUrlRequired': 'Name and URL are required',
  'workbench.searchPlaceholder': 'Search platforms…',
  'workbench.tagsLabel': 'Tags (comma-separated)',
  'workbench.catAll': 'All',
  'workbench.catChat': 'Chat',
  'workbench.catApi': 'API',
  'workbench.catImage': 'Image',
  'workbench.catCode': 'Code',
  'workbench.catKnowledge': 'Knowledge',
  'workbench.catSearch': 'Search',
  'workbench.catOther': 'Other',

  // widget
  'widget.title': 'AI Spend',
  'widget.serviceUnavailable': 'AIHome service unavailable — open the main window',

  // key dialog
  'key.title': 'Configure key — {name}',
  'key.defaultLabel': 'Primary key',
  'key.errorEmpty': 'Key cannot be empty',
} as const;
