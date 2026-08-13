import { getValues } from './settings';
import { stmts } from './db';
import { detectTaskType } from './prompt-converter';
import { isAvailable as hermesAvailable } from './hermes-adapter';

/** 一键匹配调度（原 scheduler.js 移植） */

export interface ProviderProfile {
  name: string;
  version: string;
  strengths: string[];
  promptStyle: string;
  maxContext: number;
  avgSpeed: string;
  costLevel: string;
  scoreModifiers: Record<string, number>;
  contextBonus: number;
  structuredOutputBonus: number;
  costPenalty: number;
  speedPenalty: number;
  fallback: string;
}

export const PROVIDER_PROFILES: Record<string, ProviderProfile> = {
  claude: {
    name: 'Claude Code', version: '2.1.146',
    strengths: ['code_generation', 'code_review', 'refactoring', 'multi_file_edit', 'long_context', 'structured_output'],
    promptStyle: 'xml_tags', maxContext: 200000, avgSpeed: 'medium', costLevel: 'high',
    scoreModifiers: { code_generation: 1.2, code_review: 1.4, refactoring: 1.3, debugging: 1.2, documentation: 1.1, analysis: 1.0, testing: 1.1, deployment: 0.8 },
    contextBonus: 0.15, structuredOutputBonus: 0.2, costPenalty: 0.1, speedPenalty: 0.05,
    fallback: 'codex',
  },
  codex: {
    name: 'OpenAI Codex', version: '0.133.0',
    strengths: ['code_generation', 'auto_execution', 'full_auto', 'git_integration', 'fast_iteration', 'testing'],
    promptStyle: 'imperative', maxContext: 128000, avgSpeed: 'fast', costLevel: 'medium',
    scoreModifiers: { code_generation: 1.3, code_review: 0.9, refactoring: 1.0, debugging: 1.1, documentation: 0.8, analysis: 0.7, testing: 1.3, deployment: 1.1 },
    contextBonus: 0.1, structuredOutputBonus: 0.05, costPenalty: 0.05, speedPenalty: -0.1,
    fallback: 'claude',
  },
  hermes: {
    name: 'Hermes Agent', version: '0.15.1',
    strengths: ['self_improvement', 'skill_system', 'memory', 'long_conversation', 'tool_chaining', 'multi_model', 'analysis'],
    promptStyle: 'skill_annotated', maxContext: 65536, avgSpeed: 'variable', costLevel: 'low',
    scoreModifiers: { code_generation: 0.9, code_review: 1.0, refactoring: 0.8, debugging: 0.9, documentation: 1.2, analysis: 1.3, testing: 0.9, deployment: 0.7 },
    contextBonus: 0.05, structuredOutputBonus: 0.1, costPenalty: -0.1, speedPenalty: 0.1,
    fallback: 'claude',
  },
};

const TASK_SIZE_HEURISTICS = {
  small: { maxChars: 100, contextWeight: 0 },
  medium: { maxChars: 500, contextWeight: 0.1 },
  large: { maxChars: 2000, contextWeight: 0.2 },
  xlarge: { maxChars: Infinity, contextWeight: 0.3 },
};

export function estimateTaskSize(task: string): string {
  const len = task.length;
  for (const [size, config] of Object.entries(TASK_SIZE_HEURISTICS)) {
    if (len <= config.maxChars) return size;
  }
  return 'xlarge';
}

export function getHistoryBias(): Record<string, number> {
  try {
    const rows = stmts.listAgents();
    const stats: Record<string, { runs: number; success: number }> = {
      claude: { runs: 0, success: 0 }, codex: { runs: 0, success: 0 }, hermes: { runs: 0, success: 0 },
    };
    for (const a of rows) {
      const p = String(a.provider);
      if (!stats[p]) continue;
      stats[p].runs++;
      if (a.status === 'completed') stats[p].success++;
    }
    const bias: Record<string, number> = {};
    for (const [p, s] of Object.entries(stats)) {
      if (s.runs >= 3) {
        const rate = s.success / s.runs;
        bias[p] = (rate - 0.5) * 0.2;
      }
    }
    return bias;
  } catch {
    return {};
  }
}

export function getRecentFailures(provider: string, minutes = 10): number {
  try {
    const cutoff = new Date(Date.now() - minutes * 60000).toISOString();
    const rows = stmts.listAgents();
    return rows.filter((a) => a.provider === provider && a.status === 'error' && a.finished_at && a.finished_at > cutoff).length;
  } catch {
    return 0;
  }
}

export function selectProvider(task: string, opts: { model?: string; target?: string; skill?: string; provider?: string } = {}): string {
  if (opts.provider) return opts.provider;

  const taskType = detectTaskType(task);
  const taskSize = estimateTaskSize(task);
  const hermesOk = hermesAvailable();
  const hermesEnabled = getValues()['connection.hermes_enabled'] !== 'false';
  const historyBias = getHistoryBias();

  const scores: Record<string, number> = {};
  for (const [provider, profile] of Object.entries(PROVIDER_PROFILES)) {
    if (provider === 'hermes' && (!hermesOk || !hermesEnabled)) continue;

    let score = 1.0;
    const modifier = profile.scoreModifiers[taskType] || 1.0;
    score *= modifier;

    if (taskSize === 'large' || taskSize === 'xlarge') score += profile.contextBonus;
    if (taskType === 'code_review' || taskType === 'analysis') score += profile.structuredOutputBonus;

    score -= profile.costPenalty;
    score -= profile.speedPenalty;

    if (opts.model && provider === 'hermes') score += 0.1;
    if (opts.skill && provider === 'hermes') score += 0.3;

    if (historyBias[provider]) score += historyBias[provider];

    const recentFailures = getRecentFailures(provider);
    if (recentFailures > 0) {
      score -= Math.min(0.3, recentFailures * 0.1);
    }

    scores[provider] = Math.round(score * 1000) / 1000;
  }

  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  return sorted[0]?.[0] || 'claude';
}

export function getFallbackChain(provider: string): string[] {
  const chain = [provider];
  let current = provider;
  for (let i = 0; i < 3; i++) {
    const next = PROVIDER_PROFILES[current]?.fallback;
    if (!next || chain.includes(next)) break;
    chain.push(next);
    current = next;
  }
  return chain;
}

export function selectModel(task: string, provider: string): string {
  const vals = getValues();
  if (provider === 'hermes') return vals['connection.hermes_default_model'] || '';
  if (provider === 'claude') return vals['agent.claude_default_model'] || 'claude-sonnet-4-20250514';
  if (provider === 'codex') return vals['agent.codex_default_model'] || 'codex-mini';
  return '';
}

export function getScheduleExplanation(task: string, opts: { model?: string; target?: string; skill?: string; provider?: string } = {}): Record<string, unknown> {
  const provider = selectProvider(task, opts);
  const model = selectModel(task, provider);
  const taskType = detectTaskType(task);
  const taskSize = estimateTaskSize(task);
  const fallbackChain = getFallbackChain(provider);
  const historyBias = getHistoryBias();

  const reasons: string[] = [];
  const profile = PROVIDER_PROFILES[provider];
  const modifier = profile?.scoreModifiers[taskType] || 1;

  if (modifier >= 1.2) reasons.push(`${profile?.name || provider} 在 ${taskType} 任务上表现优秀 (×${modifier})`);
  if (taskSize === 'large' || taskSize === 'xlarge') reasons.push(`任务规模较大，${profile?.name} 的上下文处理能力加分`);
  if ((profile?.costPenalty ?? 0) < 0) reasons.push(`${profile?.name} 运行成本较低`);
  if ((profile?.speedPenalty ?? 0) < 0) reasons.push(`${profile?.name} 执行速度较快`);
  if (opts.skill && provider === 'hermes') reasons.push('指定了技能，Hermes 技能系统加分');
  if (historyBias[provider] && historyBias[provider] > 0) reasons.push(`历史成功率较高 (+${(historyBias[provider] * 100).toFixed(0)}%)`);
  if (fallbackChain.length > 1) reasons.push(`失败回退链: ${fallbackChain.map((p) => PROVIDER_PROFILES[p]?.name || p).join(' → ')}`);

  const allScores = Object.entries(PROVIDER_PROFILES).map(([p, prof]) => ({
    provider: p,
    name: prof.name,
    modifier: prof.scoreModifiers[taskType] || 1,
    costPenalty: prof.costPenalty,
    speedPenalty: prof.speedPenalty,
    historyBias: historyBias[p] || 0,
  }));

  return { task, taskType, taskSize, selectedProvider: provider, selectedProviderName: profile?.name || provider, selectedModel: model, fallbackChain, reasons, allScores };
}

export function getProviderProfiles(): Record<string, ProviderProfile> {
  return PROVIDER_PROFILES;
}
