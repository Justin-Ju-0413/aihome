/** board / agents / graph 模块文案（英文基准） */
export const boardEn = {
  // agent 卡片
  'board.agent.noDescription': 'No description',
  'board.agent.noDescriptionProvided': 'No description provided',
  'board.agent.filesCount': '{count} files',

  // 卡片详情
  'board.detail.associatedFiles': 'Associated Files',
  'board.detail.scriptsCount': '{count} scripts',
  'board.detail.refsCount': ', {count} refs',
  'board.detail.assetsCount': ', {count} assets',
  'board.detail.directory': 'Directory',
  'board.detail.metadata': 'Metadata',
  'board.detail.contentPreview': 'Content Preview',
  'board.detail.file': 'File: {path}',
  'board.detail.created': 'Created: {date}',
  'board.detail.updated': 'Updated: {date}',

  // 看板列
  'board.column.addAgent': 'Add Agent',

  // board 页面
  'board.page.loadFailed': 'Failed to load agents',
  'board.page.scanFound': 'Found {count} agents',
  'board.page.scanFailed': 'Scan failed',
  'board.page.title': 'Agent Board',
  'board.page.summary': '{count} agents in {groups} groups',
  'board.page.rescan': 'Rescan',
  'board.page.newAgent': 'New Agent',

  // 搜索 / 过滤
  'board.search.placeholder': 'Search agents...',
  'board.filter.allTypes': 'All Types',
  'board.filter.agents': 'Agents',
  'board.filter.skills': 'Skills',

  // 卡片删除（确认 / toast）
  'board.card.confirmDelete': 'Delete "{name}"? This cannot be undone.',
  'board.card.deleted': 'Agent deleted',
  'board.card.deleteFailed': 'Failed to delete agent',

  // 新建弹窗
  'board.create.created': 'Agent created',
  'board.create.createFailed': 'Failed to create agent',
  'board.create.title': 'Create New Agent',
  'board.create.type': 'Type',
  'board.create.agent': 'Agent',
  'board.create.formatAgents': 'AGENTS.md format',
  'board.create.skill': 'Skill',
  'board.create.formatSkill': 'SKILL.md format',
  'board.create.namePlaceholder': 'e.g., code-assistant',
  'board.create.descPlaceholder': 'What does this agent do?',

  // agents 列表
  'agents.page.loadFailed': 'Failed to load agents',
  'agents.page.title': 'Agents',
  'agents.page.found': '{count} agents found',
  'agents.page.searchPlaceholder': 'Search...',
  'agents.page.fullText': 'Full-text',
  'agents.page.filesDir': '{count} files • {dir}',
  'agents.page.noResults': 'No agents found',
  'agents.page.emptyHint': 'Create your first agent to get started',
  'board.list.type': 'Type',

  // agent 详情
  'agents.detail.loadFailed': 'Failed to load agent',
  'agents.detail.saved': 'Saved successfully',
  'agents.detail.saveFailed': 'Failed to save',
  'agents.detail.deleteFailed': 'Failed to delete',
  'agents.detail.tabEdit': 'Edit',
  'agents.detail.tabFiles': 'Files',
  'agents.detail.tabPreview': 'Preview',
  'agents.detail.metadataFrontmatter': 'Metadata (Frontmatter)',
  'agents.detail.content': 'Content',
  'agents.detail.filesIn': 'Files in {name}',
  'agents.detail.main': 'Main',
  'agents.detail.directory': 'Directory: {path}',
  'agents.detail.associatedFiles': 'Associated files: {count}',
  'agents.detail.scriptsCount': 'Scripts: {count}',
  'agents.detail.referencesCount': 'References: {count}',
  'agents.detail.assetsCount': 'Assets: {count}',
  'agents.detail.rulesCount': 'Rules: {count}',

  // graph 页面
  'graph.page.loading': 'Loading graph...',
  'graph.page.loadFailed': 'Failed to load graph',
  'graph.page.saveRelationFailed': 'Failed to save relation',
  'graph.page.title': 'Agent Graph',
  'graph.page.subtitle': 'Visualize agent relationships and dependencies',
  'graph.page.dragHint': 'Drag between nodes to create connections',
  'graph.page.legendCalls': 'Calls',
  'graph.page.legendDepends': 'Depends',
  'graph.page.legendExtends': 'Extends',
  'graph.page.legendReferences': 'References',
  'graph.page.legendAgent': 'Agent',
  'graph.page.legendSkill': 'Skill',
} as const;
