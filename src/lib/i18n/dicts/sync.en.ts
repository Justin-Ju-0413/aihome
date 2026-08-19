/** sync 模块文案（英文基准）— 由并行任务填充 */
export const syncEn = {
  // sync 页面 / 状态
  'sync.title': 'Skill Sync',
  'sync.statusLoadError': 'Failed to load sync status',
  'sync.migrated': 'Migrated {n} skills from ~/skill-sync to ~/.aihome/repo (old directory kept, can be deleted manually)',
  'sync.centerRepo': 'Center repository',
  'sync.summarySkills': '{n} skills',
  'sync.summaryConflicts': '{n} conflicts',
  'sync.summaryEndpoints': '{n} endpoints',
  'sync.pathMissing': 'Path missing',
  'sync.endpointStats': '{count} skills · {missing} missing · {different} different · {extra} endpoint-only',
  'sync.runFailed': 'Failed to {kind}',
  'sync.collectResult': 'collect: {newCount} new, {updated} updated, {conflict} conflicts, {skipped} skipped',
  'sync.pushResult': 'push: {updated} updated, {skipped} skipped',
  'sync.dryRunSuffix': ' (dry-run)',

  // sync 冲突
  'sync.conflict.title': 'Conflicts',
  'sync.conflict.none': 'No conflicts',
  'sync.conflict.titleWithCount': 'Conflicts ({count})',
  'sync.conflict.sourceEndpoint': 'Source endpoint',

  // sync 端点
  'sync.endpoint.title': 'Sync endpoints',
  'sync.endpoint.loadFailed': 'Failed to load sync endpoints',
  'sync.endpoint.saved': 'Sync endpoints saved',
  'sync.endpoint.saveFailed': 'Failed to save',
  'sync.endpoint.saveAll': 'Save endpoints',
  'sync.endpoint.deleteLabel': 'Delete {name}',
  'sync.endpoint.namePlaceholder': 'Endpoint name (e.g. opencode)',
  'sync.endpoint.pathPlaceholder': 'Endpoint path (e.g. ~/.claude/skills)',

  // onboarding
  'onboarding.kicker': 'GET STARTED',
  'onboarding.welcome': 'Welcome to AIHome',
  'onboarding.intro': 'First time here? Choose the directories that store agent definitions (AGENTS.md / SKILL.md).',
  'onboarding.stepChooseDir': 'Choose directory',
  'onboarding.stepPreview': 'Preview scan',
  'onboarding.stepSave': 'Save',
  'onboarding.workspaceDirLabel': 'Workspace directories (one absolute path per line)',
  'onboarding.noPathsError': 'Please enter at least one directory path',
  'onboarding.foundCount': 'Found {n} agents/skills',
  'onboarding.saveSuccess': 'Workspace saved',
  'onboarding.saveFailed': 'Failed to save',

  // registry
  'registry.importNamePrompt': 'Skill name (generates registry id)',
  'registry.importSourcePrompt': 'Absolute path of source directory (directory containing SKILL.md)',
  'registry.fixed': ' ✓ Fixed',
  'registry.notSynced': 'Not synced',
  'registry.empty': 'Registry is empty — click "Import" to import skills from platform directories.',
  'registry.deleteConfirm': 'Delete {name}? This will remove its links on all enabled platforms (platform directory contents are not deleted).',

  // skills 注册表页
  'skills.title': 'Skill Registry',
  'skills.description': 'Only one canonical copy is stored and distributed to agent platforms via symlinks (Claude Code / Codex / WorkBuddy). Real directories are never overwritten.',
} as const;
