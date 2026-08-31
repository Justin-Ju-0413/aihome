import { NextResponse } from 'next/server';
import { ensureFvInit } from '@/lib/fv/init';
import * as agentRunner from '@/lib/fv/agent-runner';
import { listTemplates } from '@/lib/fv/templates';

export async function GET() {
  ensureFvInit();
  const agents = agentRunner.listAgents();
  const completed = agents.filter((a) => a.status === 'completed');
  const errored = agents.filter((a) => a.status === 'error');
  const running = agents.filter((a) => a.status === 'running');

  const avgDuration = completed.length > 0
    ? completed.reduce((sum, a) => {
      if (a.started_at && a.finished_at) {
        return sum + (new Date(String(a.finished_at)).getTime() - new Date(String(a.started_at)).getTime());
      }
      return sum;
    }, 0) / completed.length
    : 0;

  const totalTokens = agents.reduce((sum, a) => sum + Number(a.token_usage || 0), 0);

  return NextResponse.json({
    totalAgents: agents.length,
    completed: completed.length,
    errored: errored.length,
    running: running.length,
    successRate: agents.length > 0 ? ((completed.length / (completed.length + errored.length)) * 100).toFixed(1) + '%' : '0%',
    avgDurationMs: Math.round(avgDuration),
    totalTokens,
    templates: listTemplates().length,
    pipelines: agentRunner.listPipelines().length,
  });
}
