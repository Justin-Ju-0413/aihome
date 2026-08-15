import type { boardEn } from './board.en';

/** board / agents / graph 模块文案（中文）— 键必须与英文基准完全一致（tsc 强制） */
export const boardZh: Record<keyof typeof boardEn, string> = {
  // agent 卡片
  'board.agent.noDescription': '无描述',
  'board.agent.noDescriptionProvided': '未提供描述',
  'board.agent.filesCount': '{count} 个文件',

  // 卡片详情
  'board.detail.associatedFiles': '关联文件',
  'board.detail.scriptsCount': '{count} 个脚本',
  'board.detail.refsCount': '，{count} 个引用',
  'board.detail.assetsCount': '，{count} 个资源',
  'board.detail.directory': '目录',
  'board.detail.metadata': '元数据',
  'board.detail.contentPreview': '内容预览',
  'board.detail.file': '文件：{path}',
  'board.detail.created': '创建于：{date}',
  'board.detail.updated': '更新于：{date}',

  // 看板列
  'board.column.addAgent': '添加 Agent',

  // board 页面
  'board.page.loadFailed': '加载 agents 失败',
  'board.page.scanFound': '发现 {count} 个 agents',
  'board.page.scanFailed': '扫描失败',
  'board.page.title': 'Agent 看板',
  'board.page.summary': '{groups} 个分组中共 {count} 个 agents',
  'board.page.rescan': '重新扫描',
  'board.page.newAgent': '新建 Agent',

  // 搜索 / 过滤
  'board.search.placeholder': '搜索 agents...',
  'board.filter.allTypes': '全部类型',
  'board.filter.agents': 'Agents',
  'board.filter.skills': '技能',

  // 卡片删除（确认 / toast）
  'board.card.confirmDelete': '确定删除“{name}”？此操作无法撤销。',
  'board.card.deleted': 'Agent 已删除',
  'board.card.deleteFailed': '删除 agent 失败',

  // 新建弹窗
  'board.create.created': 'Agent 已创建',
  'board.create.createFailed': '创建 agent 失败',
  'board.create.title': '新建 Agent',
  'board.create.type': '类型',
  'board.create.agent': 'Agent',
  'board.create.formatAgents': 'AGENTS.md 格式',
  'board.create.skill': '技能',
  'board.create.formatSkill': 'SKILL.md 格式',
  'board.create.namePlaceholder': '例如：code-assistant',
  'board.create.descPlaceholder': '这个 agent 是做什么的？',

  // agents 列表
  'agents.page.loadFailed': '加载 agents 失败',
  'agents.page.title': 'Agents',
  'agents.page.found': '找到 {count} 个 agents',
  'agents.page.searchPlaceholder': '搜索...',
  'agents.page.fullText': '全文',
  'agents.page.filesDir': '{count} 个文件 • {dir}',
  'agents.page.noResults': '未找到 agents',
  'agents.page.emptyHint': '创建您的第一个 agent 开始使用',
  'board.list.type': '类型',

  // agent 详情
  'agents.detail.loadFailed': '加载 agent 失败',
  'agents.detail.saved': '保存成功',
  'agents.detail.saveFailed': '保存失败',
  'agents.detail.deleteFailed': '删除失败',
  'agents.detail.tabEdit': '编辑',
  'agents.detail.tabFiles': '文件',
  'agents.detail.tabPreview': '预览',
  'agents.detail.metadataFrontmatter': '元数据（Frontmatter）',
  'agents.detail.content': '内容',
  'agents.detail.filesIn': '{name} 中的文件',
  'agents.detail.main': '主文件',
  'agents.detail.directory': '目录：{path}',
  'agents.detail.associatedFiles': '关联文件数：{count}',
  'agents.detail.scriptsCount': '脚本数：{count}',
  'agents.detail.referencesCount': '引用数：{count}',
  'agents.detail.assetsCount': '资源数：{count}',
  'agents.detail.rulesCount': '规则数：{count}',

  // graph 页面
  'graph.page.loading': '加载图谱中...',
  'graph.page.title': 'Agent 关系图',
  'graph.page.subtitle': '可视化 agent 之间的关系与依赖',
  'graph.page.dragHint': '在节点之间拖拽以创建连线',
  'graph.page.legendCalls': '调用',
  'graph.page.legendDepends': '依赖',
  'graph.page.legendExtends': '继承',
  'graph.page.legendReferences': '引用',
  'graph.page.legendAgent': 'Agent',
  'graph.page.legendSkill': '技能',
};
