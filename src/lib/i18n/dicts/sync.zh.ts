import type { syncEn } from './sync.en';

/** sync 模块文案（中文）— 键必须与英文基准完全一致（tsc 强制） */
export const syncZh: Record<keyof typeof syncEn, string> = {
  // sync 页面 / 状态
  'sync.statusLoadError': '加载同步状态失败',
  'sync.migrated': '已从 ~/skill-sync 迁移 {n} 个技能到 ~/.aihome/repo（旧目录保留，可手动删除）',
  'sync.centerRepo': '中心仓库',
  'sync.summarySkills': '{n} 技能',
  'sync.summaryConflicts': '{n} 冲突',
  'sync.summaryEndpoints': '{n} 端',
  'sync.pathMissing': '路径缺失',
  'sync.endpointStats': '{count} 技能 · 缺 {missing} · 不同 {different} · 端独有 {extra}',
  'sync.runFailed': '同步失败（{kind}）',
  'sync.collectResult': 'collect: {newCount} 新增, {updated} 更新, {conflict} 冲突, {skipped} 跳过',
  'sync.pushResult': 'push: {updated} 更新, {skipped} 跳过',
  'sync.dryRunSuffix': '（dry-run）',

  // sync 冲突
  'sync.conflict.title': '冲突',
  'sync.conflict.none': '无冲突',
  'sync.conflict.titleWithCount': '冲突（{count}）',
  'sync.conflict.sourceEndpoint': '来源端',

  // sync 端点
  'sync.endpoint.title': '同步端点',
  'sync.endpoint.loadFailed': '加载同步端点失败',
  'sync.endpoint.saved': '同步端点已保存',
  'sync.endpoint.saveFailed': '保存失败',
  'sync.endpoint.saveAll': '保存端点',
  'sync.endpoint.deleteLabel': '删除 {name}',
  'sync.endpoint.namePlaceholder': '端名（如 opencode）',
  'sync.endpoint.pathPlaceholder': '端路径（如 ~/.claude/skills）',

  // onboarding
  'onboarding.welcome': '欢迎使用 AIHome',
  'onboarding.intro': '首次使用：选择存放 agent 定义（AGENTS.md / SKILL.md）的目录。',
  'onboarding.stepChooseDir': '选择目录',
  'onboarding.stepPreview': '预览扫描',
  'onboarding.stepSave': '保存',
  'onboarding.workspaceDirLabel': '工作区目录（每行一个绝对路径）',
  'onboarding.noPathsError': '请至少输入一个目录路径',
  'onboarding.foundCount': '发现 {n} 个 agent/skill',
  'onboarding.saveSuccess': '工作区已保存',
  'onboarding.saveFailed': '保存失败',

  // registry
  'registry.importNamePrompt': '技能名称（生成注册表 id）',
  'registry.importSourcePrompt': '源目录绝对路径（含 SKILL.md 的目录）',
  'registry.fixed': ' ✓ 已修复',
  'registry.notSynced': '未同步',
  'registry.empty': '注册表为空——点「导入」从平台目录导入技能',
  'registry.deleteConfirm': '删除 {name}？将移除其在所有启用平台上的链接（不删除平台目录内容）。',

  // skills 注册表页
  'skills.title': '技能注册表',
  'skills.description': '规范副本只存一份，通过符号链接分发到各 agent 平台（Claude Code / Codex / WorkBuddy）。真实目录不会被覆盖。',
};
