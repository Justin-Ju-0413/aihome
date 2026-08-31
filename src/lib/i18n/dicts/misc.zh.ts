import type { miscEn } from './misc.en';

/** misc 模块文案（中文）— 键必须与英文基准完全一致（tsc 强制） */

// usage
const usage = {
  'usage.overviewToday': '今日',
  'usage.overviewWeek': '本周',
  'usage.overviewMonth': '本月',
  'usage.overviewRequests': '请求数',
  'usage.overviewTokens': 'Token 数',
  'usage.pageTitle': '用量',
  'usage.filterAll': '全部',
  'usage.rescan': '重新扫描',
  'usage.scanning': '扫描中…',
  'usage.loading': '正在加载用量数据…',
  'usage.loadFailed': '无法加载用量数据',
  'usage.refreshed': '用量数据已刷新',
  'usage.rescanFailed': '重新扫描失败',
  'usage.kline': 'K线',
  'usage.amount': '金额',
  'usage.tokens': 'Token',
  'usage.dailySpend': '每日花费',
  'usage.bySource': '按来源',
  'usage.topModels': '热门模型',
  'usage.tableAgent': 'Agent',
  'usage.table24hTokens': '24小时 Token',
  'usage.table24hCost': '24小时费用',
  'usage.tableMonthTokens': '本月 Token',
  'usage.tableMonthCost': '本月费用',
  'usage.unknownPricing': '未知定价',
  'usage.emptyText': '暂无用量数据 — 使用 AI 工具后点击重新扫描。',
};

// health
const health = {
  'health.title': '工作区健康',
  'health.subtitle': '校验工作区：不可读路径、扫描/解析错误、重名 agent。',
  'health.recheck': '重新检查',
  'health.allGood': '一切正常',
  'health.fetchFailed': '无法获取健康状态',
  'health.unreadablePath': '路径不可读',
  'health.scanError': '扫描/解析错误',
  'health.duplicateAgent': '重名 agent',
};

// workbench
const workbench = {
  'workbench.title': '工作台',
  'workbench.addPlatform': '添加平台',
  'workbench.editPlatform': '编辑平台',
  'workbench.loading': '加载中…',
  'workbench.noMatch': '没有匹配的平台',
  'workbench.nameUrlRequired': '名称和网址必填',
  'workbench.searchPlaceholder': '搜索平台…',
  'workbench.tagsLabel': '标签（逗号分隔）',
  'workbench.catAll': '全部',
  'workbench.catChat': '对话',
  'workbench.catApi': 'API平台',
  'workbench.catImage': '图像',
  'workbench.catCode': '代码',
  'workbench.catKnowledge': '知识库',
  'workbench.catSearch': '搜索',
  'workbench.catOther': '其他',
};

// widget
const widget = {
  'widget.title': 'AI 花费',
  'widget.serviceUnavailable': 'AIHome 服务不可用——请打开主窗口',
};

// key dialog
const key = {
  'key.title': '配置 key — {name}',
  'key.defaultLabel': '主 key',
  'key.errorEmpty': 'key 不能为空',
};

const miscContent = { ...usage, ...health, ...workbench, ...widget, ...key };

/** misc 模块文案（中文）— 键必须与英文基准完全一致（tsc 强制） */
export const miscZh: Record<keyof typeof miscEn, string> = miscContent;
