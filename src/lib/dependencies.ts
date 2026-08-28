import { basename } from 'path';
import type { AgentNode } from './types';

/**
 * Agent 依赖解析：从 AGENTS.md 章节 / SKILL.md frontmatter 提取声明的依赖名，
 * 再解析为 agent id 并组装正向(dependencies)/反向(calledBy)边。
 * 从 scanner 拆出，保持行为不变，可独立单测。
 */

/**
 * Parse declared dependency names from an AGENTS.md `## Dependencies` (or
 * "Depends On" / "依赖") section. Accepts `- Name`, `- [[Name]]`,
 * `- [Name](path)`, and `` - `Name` `` list items.
 */
export function extractDependencyNamesFromSections(
  sections: Array<{ title: string; content: string }>
): string[] {
  const depSection = sections.find(s =>
    /^(dependencies|depends[ -]on|依赖)$/i.test(s.title.trim())
  );
  if (!depSection) return [];

  const names: string[] = [];
  for (const line of depSection.content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('-') && !trimmed.startsWith('*')) continue;
    const item = trimmed.replace(/^[-*]\s+/, '').trim();
    const wiki = item.match(/^\[\[([^\]]+)\]\]/);
    const md = item.match(/^\[([^\]]+)\]/);
    const code = item.match(/^`([^`]+)`/);
    const raw = wiki?.[1] || md?.[1] || code?.[1] || item;
    const name = raw.replace(/\s*\(.*\)$/, '').replace(/\s*:.*$/, '').trim();
    if (name) names.push(name);
  }
  return names;
}

export function normalizeDepNames(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(v => String(v).trim()).filter(Boolean);
  if (typeof value === 'string') return value.split(',').map(s => s.trim()).filter(Boolean);
  return [];
}

/**
 * Resolve declared dependency names to agent ids and populate the forward
 * (`dependencies`) and reverse (`calledBy`) links. Names match by agent name
 * or directory basename, case-insensitively.
 */
export function resolveDependencies(agents: AgentNode[], depNamesByAgentId: Map<string, string[]>): void {
  const byName = new Map<string, AgentNode>();
  const byDir = new Map<string, AgentNode>();
  for (const a of agents) {
    byName.set(a.name.toLowerCase(), a);
    byDir.set(basename(a.dirPath).toLowerCase(), a);
  }

  for (const a of agents) {
    a.dependencies = [];
    a.calledBy = [];
  }

  for (const a of agents) {
    const names = depNamesByAgentId.get(a.id) ?? [];
    const depIds: string[] = [];
    for (const n of names) {
      const target = byName.get(n.toLowerCase()) ?? byDir.get(n.toLowerCase());
      if (target && target.id !== a.id && !depIds.includes(target.id)) {
        depIds.push(target.id);
        if (!target.calledBy.includes(a.id)) target.calledBy.push(a.id);
      }
    }
    a.dependencies = depIds;
  }
}
