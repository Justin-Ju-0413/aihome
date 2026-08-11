'use client';

import { useState } from 'react';
import { GitBranch, Plus, Play, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useConsoleStore } from '@/stores/console-store';
import { fvApi } from '@/lib/fv/api';
import { cn } from '@/lib/utils';
import type { FvPipeline } from '@/lib/fv/types';

const PIPELINE_STATUS: Record<string, { label: string; cls: string }> = {
  completed: { label: '已完成', cls: 'bg-primary/10 text-primary' },
  running: { label: '运行中', cls: 'bg-emerald-50 text-emerald-700' },
  error: { label: '出错', cls: 'bg-rose-50 text-rose-600' },
  pending: { label: '待启动', cls: 'bg-amber-50 text-amber-700' },
};

const PROVIDER_ICON: Record<string, string> = { claude: '🤖', codex: '⚡', hermes: '🧠' };

export function PipelinesTab() {
  const pipelines = useConsoleStore((s) => s.pipelines);
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <div className="p-6" data-testid="pipelines-tab">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted">{pipelines.length} 条流水线</p>
        <button
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-white text-sm hover:bg-primary/90"
          data-testid="create-pipeline"
        >
          <Plus className="w-4 h-4" /> 新流水线
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {pipelines.map((p) => (
          <PipelineCard key={p.id} pipeline={p} />
        ))}
        {pipelines.length === 0 && (
          <div className="col-span-full text-center py-16">
            <GitBranch className="w-12 h-12 text-card-border mx-auto mb-3" />
            <p className="text-muted text-sm">暂无流水线</p>
          </div>
        )}
      </div>

      {modalOpen && <CreatePipelineModal onClose={() => setModalOpen(false)} />}
    </div>
  );
}

function PipelineCard({ pipeline }: { pipeline: FvPipeline }) {
  const meta = PIPELINE_STATUS[pipeline.status] || PIPELINE_STATUS.pending;

  const start = async () => {
    try {
      await fvApi.startPipeline(pipeline.id);
      toast.success(`${pipeline.name} 已启动`);
      void useConsoleStore.getState().loadPipelines();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <div className="bg-white rounded-lg border border-card-border p-4">
      <div className="flex items-center gap-2 mb-2">
        <h3 className="font-heading font-semibold text-heading">{pipeline.name}</h3>
        <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-medium', meta.cls)}>{meta.label}</span>
        {pipeline.status === 'pending' && (
          <button onClick={() => void start()} className="ml-auto inline-flex items-center gap-1 px-2 py-1 rounded bg-primary text-white text-[10px] hover:bg-primary/90">
            <Play className="w-3 h-3" /> 启动
          </button>
        )}
      </div>
      {pipeline.description && <p className="text-xs text-muted mb-3">{pipeline.description}</p>}
      <div className="flex items-center gap-1.5 flex-wrap">
        {pipeline.agents.map((a, i) => (
          <div key={a.id} className="flex items-center gap-1.5">
            <div className="flex flex-col items-center gap-0.5 border border-card-border rounded-lg px-2 py-1.5">
              <span className="text-lg">{PROVIDER_ICON[a.provider] || '🤖'}</span>
              <span className="text-[10px] text-text-body max-w-24 truncate">{a.name}</span>
              <span className="text-[10px] text-muted">{Math.round(a.progress)}%</span>
            </div>
            {i < pipeline.agents.length - 1 && <span className="text-muted">→</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function CreatePipelineModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [agents, setAgents] = useState<Array<{ provider: string; name: string; prompt: string; target: string }>>([
    { provider: 'claude', name: '', prompt: '', target: '' },
  ]);
  const [saving, setSaving] = useState(false);

  const create = async () => {
    if (!name.trim()) return toast.error('请输入流水线名称');
    if (agents.some((a) => !a.name.trim() || !a.prompt.trim())) return toast.error('每个 Agent 需要名称和提示词');
    setSaving(true);
    try {
      const { id } = await fvApi.createPipeline({
        name, description,
        agents: agents.map((a) => ({ name: a.name, provider: a.provider, prompt: a.prompt, target: a.target })),
      });
      toast.success(`流水线已创建 (${id.slice(0, 8)})`);
      void useConsoleStore.getState().loadPipelines();
      onClose();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-6" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-divider">
          <h3 className="font-heading font-semibold text-heading">新建流水线</h3>
          <button onClick={onClose} className="p-1 hover:bg-primary/10 rounded text-muted"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-auto p-4 space-y-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="流水线名称"
            className="w-full px-3 py-2 border border-card-border rounded-lg bg-white/80 text-sm text-text-body focus:outline-none focus:ring-2 focus:ring-accent"
          />
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="描述（可选）"
            className="w-full px-3 py-2 border border-card-border rounded-lg bg-white/80 text-sm text-text-body focus:outline-none focus:ring-2 focus:ring-accent"
          />
          <div className="space-y-2">
            {agents.map((a, i) => (
              <div key={i} className="border border-card-border rounded-lg p-3 space-y-2 bg-white/60">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted shrink-0">#{i + 1}</span>
                  <select
                    value={a.provider}
                    onChange={(e) => setAgents(agents.map((x, j) => (j === i ? { ...x, provider: e.target.value } : x)))}
                    className="px-2 py-1 border border-card-border rounded text-xs text-text-body bg-white"
                  >
                    <option value="claude">Claude</option>
                    <option value="codex">Codex</option>
                  </select>
                  <input
                    value={a.name}
                    onChange={(e) => setAgents(agents.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                    placeholder="Agent 名称"
                    className="flex-1 px-2 py-1 border border-card-border rounded text-sm text-text-body focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                  {agents.length > 1 && (
                    <button onClick={() => setAgents(agents.filter((_, j) => j !== i))} className="text-rose-500 hover:text-rose-600 text-xs">
                      删除
                    </button>
                  )}
                </div>
                <textarea
                  value={a.prompt}
                  onChange={(e) => setAgents(agents.map((x, j) => (j === i ? { ...x, prompt: e.target.value } : x)))}
                  placeholder="提示词"
                  rows={2}
                  className="w-full px-2 py-1 border border-card-border rounded text-sm text-text-body focus:outline-none focus:ring-2 focus:ring-accent"
                />
                <input
                  value={a.target}
                  onChange={(e) => setAgents(agents.map((x, j) => (j === i ? { ...x, target: e.target.value } : x)))}
                  placeholder="目标文件/目录（可选，逗号分隔）"
                  className="w-full px-2 py-1 border border-card-border rounded text-xs text-text-body focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </div>
            ))}
          </div>
          <button
            onClick={() => setAgents([...agents, { provider: 'claude', name: '', prompt: '', target: '' }])}
            className="text-xs text-primary hover:text-accent inline-flex items-center gap-1"
          >
            <Plus className="w-3 h-3" /> 添加 Agent
          </button>
        </div>
        <div className="px-4 py-3 border-t border-divider flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-sm text-muted hover:bg-primary/5">取消</button>
          <button
            onClick={() => void create()}
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-white text-sm hover:bg-primary/90 disabled:opacity-50"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} 创建
          </button>
        </div>
      </div>
    </div>
  );
}
