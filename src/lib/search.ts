import type { AgentNode } from './types';

/** 全文匹配：name/description 命中或 markdown 正文命中（大小写不敏感） */
export async function filterByFullText(
  agents: AgentNode[],
  query: string,
  readContent: (filePath: string) => Promise<string>
): Promise<AgentNode[]> {
  const q = query.trim().toLowerCase();
  if (!q) return agents;
  const matched: AgentNode[] = [];
  for (const a of agents) {
    if (a.name.toLowerCase().includes(q) || a.description.toLowerCase().includes(q)) {
      matched.push(a);
      continue;
    }
    try {
      const content = await readContent(a.filePath);
      if (content.toLowerCase().includes(q)) matched.push(a);
    } catch {
      // 文件不可读 → 跳过（不因单文件失败丢弃整个结果）
    }
  }
  return matched;
}
