'use client';

import { useEffect, useState } from 'react';
import { Play, Square, GitCompare, X, RotateCcw, Loader2, Bot } from 'lucide-react';
import { toast } from 'sonner';
import { useConsoleStore } from '@/stores/console-store';
import { fvApi } from '@/lib/fv/api';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import type { DictKey } from '@/lib/i18n';
import type { FvAgent, FvAgentDetail } from '@/lib/fv/types';

const STATUS_META: Record<string, { labelKey: DictKey; cls: string }> = {
  running: { labelKey: 'console.status.running', cls: 'bg-emerald-50 text-emerald-700' },
  completed: { labelKey: 'console.status.completed', cls: 'bg-primary/10 text-primary' },
  pending: { labelKey: 'console.status.pending', cls: 'bg-amber-50 text-amber-700' },
  stopped: { labelKey: 'console.status.stopped', cls: 'bg-muted/20 text-muted' },
  error: { labelKey: 'console.status.error', cls: 'bg-rose-50 text-rose-600' },
};

const PROVIDER_ICON: Record<string, string> = { claude: '🤖', codex: '⚡', hermes: '🧠' };

const OP_ICONS: Record<string, { icon: string; labelKey: DictKey }> = {
  read: { icon: '📖', labelKey: 'console.op.read' },
  edit: { icon: '✏️', labelKey: 'console.op.edit' },
  create: { icon: '📝', labelKey: 'console.op.create' },
  execute: { icon: '💻', labelKey: 'console.op.execute' },
  tool: { icon: '🔧', labelKey: 'console.op.tool' },
};

function ProgressRing({ progress }: { progress: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const filled = (progress / 100) * c;
  return (
    <svg width="60" height="60" viewBox="0 0 60 60" className="shrink-0">
      <circle cx="30" cy="30" r={r} fill="none" stroke="var(--color-divider, #B8D1EC)" strokeWidth="5" />
      <circle
        cx="30" cy="30" r={r} fill="none"
        stroke={progress >= 100 ? '#059669' : '#0A4F9D'}
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c - filled}
        transform="rotate(-90 30 30)"
      />
      <text x="30" y="35" textAnchor="middle" fontSize="12" fill="currentColor" className="text-text-body">
        {Math.round(progress)}%
      </text>
    </svg>
  );
}

function StepsFlow({ steps }: { steps: FvAgent['steps'] }) {
  if (!steps.length) return null;
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {steps.map((s) => (
        <div key={s.id} className="flex items-center gap-1">
          <span
            title={s.name}
            className={cn(
              'text-[10px] px-1.5 py-0.5 rounded border',
              s.status === 'done' && 'border-emerald-300 bg-emerald-50 text-emerald-700',
              s.status === 'active' && 'border-primary bg-primary/10 text-primary',
              s.status === 'pending' && 'border-card-border glass-input text-muted'
            )}
          >
            {s.status === 'done' ? '✓' : s.status === 'active' ? '●' : '○'} {s.name}
          </span>
          {s.id !== steps[steps.length - 1].id && <span className="text-muted text-[10px]">→</span>}
        </div>
      ))}
    </div>
  );
}

function DiffModal({ agentId, onClose }: { agentId: string; onClose: () => void }) {
  const [diffs, setDiffs] = useState<Array<Record<string, unknown>> | null>(null);
  const [loading, setLoading] = useState(true);
  const { t } = useI18n();

  useEffect(() => {
    void fvApi.agentDiffs(agentId).then((d) => {
      setDiffs(d as Array<Record<string, unknown>>);
      setLoading(false);
    }).catch(() => {
      toast.error(t('console.diffLoadFailed'));
      setLoading(false);
    });
  }, [agentId, t]);

  const rollback = async (filePath: string) => {
    try {
      const { ok } = await fvApi.rollback(filePath);
      if (ok) {
        toast.success(t('console.rolledBack', { path: filePath }));
        void useConsoleStore.getState().loadAgents();
        void useConsoleStore.getState().loadTree();
        onClose();
      }
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <div className="fixed inset-0 scrim z-50 flex items-center justify-center p-6" onClick={onClose}>
      <div className="glass-modal rounded-xl shadow-xl w-full max-w-3xl max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-divider">
          <h3 className="font-heading font-semibold text-heading">{t('console.diffTitle')}</h3>
          <button onClick={onClose} className="p-1 hover:bg-primary/10 rounded text-muted"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-auto p-4 space-y-3">
          {loading && <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 text-primary animate-spin" /></div>}
          {!loading && diffs?.length === 0 && <p className="text-sm text-muted text-center py-8">{t('console.noChanges')}</p>}
          {!loading && diffs?.map((d) => (
            <div key={Number(d.id)} className="border border-card-border rounded-lg overflow-hidden">
              <div className="flex items-center justify-between px-3 py-1.5 bg-primary/5">
                <span className="text-xs font-medium text-heading truncate">{String(d.file_path)}</span>
                <button
                  onClick={() => void rollback(String(d.file_path))}
                  className="inline-flex items-center gap-1 text-xs text-primary hover:text-accent shrink-0"
                >
                  <RotateCcw className="w-3 h-3" /> {t('console.rollback')}
                </button>
              </div>
              <pre className="text-xs p-3 overflow-auto max-h-64">
                {String(d.diff_content).split('\n').map((line, i) => (
                  <div key={i} className={cn(
                    line.startsWith('+') ? 'bg-emerald-50 text-emerald-700' :
                    line.startsWith('-') ? 'bg-rose-50 text-rose-600' : 'text-muted'
                  )}>
                    {line}
                  </div>
                ))}
              </pre>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AgentCard({ agent }: { agent: FvAgent }) {
  const [diffOpen, setDiffOpen] = useState(false);
  const { t, lang } = useI18n();
  const meta = STATUS_META[agent.status] || STATUS_META.pending;
  const stats = (agent as FvAgentDetail).operationStats || { read: 0, edit: 0, create: 0, execute: 0, tool: 0 };
  const activities = ((agent as FvAgentDetail).activities || []).slice(0, 6);

  const start = async () => {
    try {
      await fvApi.startAgent(agent.id);
      toast.success(t('console.agentStarted', { name: agent.name }));
      void useConsoleStore.getState().loadAgents();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const stop = async () => {
    try {
      await fvApi.stopAgent(agent.id);
      toast.success(t('console.agentStopped', { name: agent.name }));
      void useConsoleStore.getState().loadAgents();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <div className="glass-panel rounded-lg border border-card-border p-4 flex flex-col gap-3" data-testid="agent-card">
      <div className="flex items-start gap-3">
        <span className="text-2xl">{PROVIDER_ICON[agent.provider] || '🤖'}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-heading font-semibold text-heading truncate">{agent.name}</h3>
            <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-medium shrink-0', meta.cls)}>{t(meta.labelKey)}</span>
          </div>
          <p className="text-xs text-muted truncate mt-0.5">{agent.description || agent.prompt?.slice(0, 80)}</p>
          <p className="text-[10px] text-muted mt-1">
            {agent.provider}{agent.pipeline_id ? ` · ${t('console.pipelineTag')}` : ''} · {agent.cwd}
          </p>
        </div>
        <ProgressRing progress={agent.progress} />
      </div>

      {(agent.targetFiles?.length ?? 0) > 0 && (
        <div className="flex flex-wrap gap-1">
          {(agent.targetFiles as string[]).slice(0, 6).map((t) => (
            <span key={t} className="text-[10px] px-1.5 py-0.5 bg-primary/5 text-primary rounded truncate max-w-40" title={t}>
              {t.split('/').pop()}
            </span>
          ))}
        </div>
      )}

      <StepsFlow steps={agent.steps} />

      {(Object.values(stats).some((v) => v > 0)) && (
        <div className="flex gap-2 flex-wrap">
          {Object.entries(stats).filter(([, v]) => v > 0).map(([k, v]) => (
            <span key={k} className="text-[10px] px-1.5 py-0.5 rounded glass-input border border-card-border text-muted">
              {OP_ICONS[k]?.icon} {OP_ICONS[k]?.labelKey ? t(OP_ICONS[k].labelKey) : k} {v}
            </span>
          ))}
        </div>
      )}

      {activities.length > 0 && (
        <div className="text-[10px] space-y-0.5 text-muted">
          {activities.map((a, i) => (
            <div key={i} className="truncate">
              {OP_ICONS[a.type]?.icon || '🔧'} {a.tool} {a.file ? `· ${a.file.split('/').pop()}` : ''}
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-3 text-[10px] text-muted mt-auto pt-2 border-t border-divider">
        <span>{agent.started_at ? new Date(agent.started_at).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : t('console.notStarted')}</span>
        {agent.token_usage > 0 && <span>~{agent.token_usage} tokens</span>}
        {(agent as FvAgentDetail).diffs?.length > 0 && (
          <button onClick={() => setDiffOpen(true)} className="ml-auto inline-flex items-center gap-1 text-primary hover:text-accent">
            <GitCompare className="w-3 h-3" /> {(agent as FvAgentDetail).diffs.length} diff
          </button>
        )}
        {agent.status === 'pending' && (
          <button onClick={() => void start()} className="ml-auto inline-flex items-center gap-1 px-2 py-1 rounded bg-primary text-white text-[10px] hover:bg-primary/90">
            <Play className="w-3 h-3" /> {t('console.start')}
          </button>
        )}
        {agent.status === 'running' && (
          <button onClick={() => void stop()} className="ml-auto inline-flex items-center gap-1 px-2 py-1 rounded bg-rose-50 text-rose-600 text-[10px] hover:bg-rose-100">
            <Square className="w-3 h-3" /> {t('console.stop')}
          </button>
        )}
      </div>

      {diffOpen && <DiffModal agentId={agent.id} onClose={() => setDiffOpen(false)} />}
    </div>
  );
}

export function AgentTab() {
  const agents = useConsoleStore((s) => s.agents);
  const [filter, setFilter] = useState<'all' | string>('all');
  const { t } = useI18n();

  const filtered = filter === 'all' ? agents : agents.filter((a) => a.status === filter);

  return (
    <div className="p-6" data-testid="agent-tab">
      <div className="flex items-center gap-2 mb-4">
        {['all', 'running', 'pending', 'completed', 'error'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              'px-2.5 py-1 rounded-full text-xs border',
              filter === f ? 'bg-primary/10 text-primary border-primary/30' : 'text-muted border-card-border hover:text-primary'
            )}
          >
            {f === 'all' ? t('console.filterAll') : t(STATUS_META[f]?.labelKey || 'console.status.completed')}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-4">
        {filtered.map((a) => <AgentCard key={a.id} agent={a} />)}
        {filtered.length === 0 && (
          <div className="col-span-full text-center py-16">
            <Bot className="w-12 h-12 text-card-border mx-auto mb-3" />
            <p className="text-muted text-sm">{t('console.noAgents')}</p>
          </div>
        )}
      </div>
    </div>
  );
}
