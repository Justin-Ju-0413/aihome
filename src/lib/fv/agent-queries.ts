import { stmts, type Row } from './db';

/**
 * Agent 查询 / 详情聚合。
 * 从 agent-runner 拆出，保持行为不变。
 */

export interface AgentRow extends Row {
  id: string;
  name: string;
  provider: string;
  status: string;
  description: string;
  target: string;
  cwd: string;
  prompt: string;
  progress: number;
  total_steps: number;
  current_step: number;
  pipeline_id: string | null;
  pipeline_order: number;
  next_agent_id: string | null;
  token_usage: number;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
}

export function getAgentDetail(agentId: string): Record<string, unknown> | null {
  const agent = stmts.getAgent(agentId) as AgentRow | undefined;
  if (!agent) return null;
  const steps = stmts.getSteps(agentId);
  const logs = stmts.getLogs(agentId);
  const diffs = stmts.getDiffsByAgent(agentId);
  const snapshots = stmts.getSnapshotsByAgent(agentId);

  const activities: Array<{ type: string; file: string; tool: string; time: string }> = [];
  for (const log of logs) {
    if (log.type === 'structured') {
      try {
        const parsed = JSON.parse(String(log.content));
        if (parsed.edits?.length) {
          for (const e of parsed.edits) {
            activities.push({
              type: e.action === 'Edit' ? 'edit' : e.action === 'Write' ? 'create' : 'modify',
              file: e.file || '',
              tool: e.action,
              time: String(log.created_at),
            });
          }
        }
        if (parsed.tools?.length) {
          for (const t of parsed.tools) {
            if (t.name !== 'Edit' && t.name !== 'Write') {
              activities.push({
                type: 'tool',
                tool: t.name,
                file: t.input?.file_path || t.input?.path || '',
                time: String(log.created_at),
              });
            }
          }
        }
      } catch {
        // 忽略解析失败
      }
    }
    if (log.type === 'stdout') {
      try {
        const lines = String(log.content).split('\n').filter((l) => l.trim().startsWith('{'));
        for (const line of lines) {
          const obj = JSON.parse(line);
          if (obj.type === 'assistant' && obj.message?.content) {
            const content = Array.isArray(obj.message.content) ? obj.message.content : [obj.message.content];
            for (const c of content) {
              if (c.type === 'tool_use') {
                const opType = c.name === 'Read' ? 'read' : c.name === 'Edit' ? 'edit' : c.name === 'Write' ? 'create' : c.name === 'Bash' ? 'execute' : 'tool';
                activities.push({
                  type: opType,
                  tool: c.name,
                  file: c.input?.file_path || c.input?.path || '',
                  time: String(log.created_at),
                });
              }
            }
          }
        }
      } catch {
        // 忽略解析失败
      }
    }
  }

  const targetFiles = agent.target ? agent.target.split(',').map((f) => f.trim()).filter(Boolean) : [];
  const uniqueFiles = [...new Set([...targetFiles, ...activities.map((a) => a.file).filter(Boolean)])];

  return {
    ...agent, steps, logs: logs.slice(-50), diffs, snapshots: snapshots.length,
    activities: activities.slice(-30),
    targetFiles: uniqueFiles,
    operationStats: {
      read: activities.filter((a) => a.type === 'read').length,
      edit: activities.filter((a) => a.type === 'edit').length,
      create: activities.filter((a) => a.type === 'create').length,
      execute: activities.filter((a) => a.type === 'execute').length,
      tool: activities.filter((a) => a.type === 'tool').length,
    },
  };
}

export function listAgents(): Row[] {
  return stmts.listAgents();
}

export function listActiveAgents(): Row[] {
  return stmts.listActiveAgents();
}

export function getSteps(id: string): Row[] {
  return stmts.getSteps(id);
}

export function getLogs(id: string): Row[] {
  return stmts.getLogs(id);
}

export function getDiffs(id: string): Row[] {
  return stmts.getDiffsByAgent(id);
}

export function listPipelines(): Row[] {
  return stmts.listPipelines();
}

export function getPipeline(id: string): Row | undefined {
  return stmts.getPipeline(id);
}
