import type { settingsEn } from './settings.en';

/** settings 模块文案（中文）— 键必须与英文基准完全一致（tsc 强制） */
export const settingsZh: Record<keyof typeof settingsEn, string> = {
  // settings 页面
  'settings.page.title': '设置',
  'settings.page.subtitle': '配置工作区与偏好',
  'settings.page.readonlyTitle': '只读演示模式：写操作已禁用',
  'settings.page.readonlyMode': '只读模式',
  'settings.page.readonlyBanner': '只读演示模式：工作区写操作已禁用（AIHOME_READONLY 或 config.readonly）',
  'settings.page.scanPaths': '扫描路径',
  'settings.page.scanPathsDesc': '用于扫描 Agent 和 Skill 定义的目录',
  'settings.page.groups': '分组',
  'settings.page.groupsDesc': '在看板上将 Agent 组织到分组中',
  'settings.page.groupNamePlaceholder': '分组名称',
  'settings.page.about': '关于',
  'settings.page.aboutTagline': 'AIHome - AI Agent 可视化管理器',
  'settings.page.aboutVersion': '版本 {version}',
  'settings.page.aboutBuiltWith': '基于 Next.js、React 和 TailwindCSS 构建',
  'settings.page.loadFailed': '配置加载失败',
  'settings.page.scanFound': '找到 {count} 个 Agent',
  'settings.page.scanFailed': '扫描失败',

  // Workbench 余额
  'settings.balance.title': 'Workbench Balance',
  'settings.balance.description': '为已配置的平台 key 自动刷新余额查询（见 Workbench 页面）',
  'settings.balance.autoRefresh': '自动刷新余额',
  'settings.balance.intervalMin': '间隔（分钟）',
  'settings.balance.refreshAll': '全部刷新',
  'settings.balance.restoreBuiltins': '恢复内置清单',
  'settings.balance.clearKeys': '清除全部 key',
  'settings.balance.clearConfirm': '确定清除全部 API key？此操作不可撤销。',
  'settings.balance.loadFailed': '设置加载失败',
  'settings.balance.refreshed': '已刷新 {checked} 个 key，成功 {ok}',
  'settings.balance.cleared': '已清除 {n} 个 key',
  'settings.balance.restored': '已恢复 {n} 个内置平台',
  'settings.balance.storageNote': 'key 存储在本地 ~/.aihome/workbench.db；查询在服务端执行。',
};
