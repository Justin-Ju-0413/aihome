'use client';

import { useEffect, useRef, useState } from 'react';
import { Sparkles, Play, Square, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { useConsoleStore } from '@/stores/console-store';
import { fvApi } from '@/lib/fv/api';

function RunOutputPanel({ runId }: { runId: string }) {
  const [lines, setLines] = useState<string[]>([]);
  const cursorRef = useRef(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const timer = setInterval(async () => {
      try {
        const { lines: newLines, cursor } = await fvApi.runOutput(runId, cursorRef.current);
        if (newLines.length > 0) {
          cursorRef.current = cursor;
          setLines((prev) => [...prev, ...newLines].slice(-500));
        }
        const active = await fvApi.runActive();
        if (!active.some((r) => r.id === runId)) setDone(true);
      } catch {
        setDone(true);
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [runId]);

  return (
    <div className="mt-3 border border-card-border rounded-lg overflow-hidden bg-white/70">
      <div className="flex items-center justify-between px-3 py-2 bg-primary/5 border-b border-card-border">
        <span className="text-xs font-medium text-heading">实时输出 · {runId.slice(0, 8)}</span>
        {done ? <span className="text-[10px] text-muted">已结束</span> : <Loader2 className="w-3 h-3 text-primary animate-spin" />}
      </div>
      <pre className="text-xs p-3 overflow-auto max-h-80 whitespace-pre-wrap text-text-body font-mono">
        {lines.length === 0 ? (done ? '（无输出）' : '等待输出...') : lines.join('\n')}
      </pre>
    </div>
  );
}

export function HermesTab() {
  const hermes = useConsoleStore((s) => s.hermes);
  const loadHermes = useConsoleStore((s) => s.loadHermes);
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState('');
  const [skill, setSkill] = useState('');
  const [runId, setRunId] = useState<string | null>(null);
  const [launching, setLaunching] = useState(false);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);

  const launch = async () => {
    if (!prompt.trim()) return toast.error('请输入指令');
    setLaunching(true);
    try {
      const result = await fvApi.hermesLaunch({ prompt, model: model || undefined, skill: skill || undefined });
      if (result.error === 'concurrency_limit') {
        toast.error((result.message as string) || '已达并发上限');
        return;
      }
      setRunId(result.runId as string);
      toast.success('Hermes 已启动');
      void loadHermes();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLaunching(false);
    }
  };

  const abort = async () => {
    if (!runId) return;
    try {
      await fvApi.hermesAbort(runId);
      toast.success('已终止');
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  if (!hermes) {
    return (
      <div className="p-6 text-center py-20" data-testid="hermes-tab">
        <Sparkles className="w-12 h-12 text-card-border mx-auto mb-3" />
        <p className="text-muted text-sm">加载中...</p>
      </div>
    );
  }

  if (!hermes.available) {
    return (
      <div className="p-6 text-center py-20" data-testid="hermes-tab">
        <Sparkles className="w-12 h-12 text-card-border mx-auto mb-3" />
        <p className="font-heading font-semibold text-heading">Hermes 不可用</p>
        <p className="text-sm text-muted mt-2">
          未找到 {hermes.home}/state.db
        </p>
        <p className="text-xs text-muted mt-1">请确认 Hermes 已安装并初始化（或修改设置中的 Hermes HOME 目录）</p>
      </div>
    );
  }

  const stats = hermes.stats as Record<string, number> | null;
  const sessions = hermes.sessions as Array<Record<string, unknown>>;
  const skills = hermes.skills as Array<Record<string, unknown>>;

  const statCards = [
    { label: '总会话', value: stats?.totalSessions ?? 0 },
    { label: '输入 Token', value: stats?.totalInputTokens ?? 0 },
    { label: '输出 Token', value: stats?.totalOutputTokens ?? 0 },
    { label: '推理 Token', value: stats?.totalReasoningTokens ?? 0 },
    { label: '估算费用', value: `$${(stats?.estimatedCost ?? 0).toFixed(3)}` },
    { label: '实际费用', value: `$${(stats?.actualCost ?? 0).toFixed(3)}` },
  ];

  return (
    <div className="p-6 max-w-5xl space-y-6" data-testid="hermes-tab">
      <div className="flex items-center gap-2">
        <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-50 text-emerald-700">已连接</span>
        <span className="text-xs text-muted">{hermes.home}</span>
        <button onClick={() => void loadHermes()} className="ml-auto text-xs text-primary hover:text-accent">刷新</button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {statCards.map((c) => (
          <div key={c.label} className="bg-white rounded-lg border border-card-border p-3">
            <p className="text-[10px] text-muted">{c.label}</p>
            <p className="font-heading font-semibold text-heading text-sm mt-1">{c.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 会话列表 */}
        <div>
          <h4 className="text-xs font-medium text-muted mb-2">最近会话</h4>
          <div className="space-y-1.5 max-h-80 overflow-auto">
            {sessions.slice(0, 15).map((s) => (
              <button
                key={String(s.id)}
                onClick={() => void fvApi.hermesSessionDetail(String(s.id)).then(setDetail).catch(() => {})}
                className="w-full text-left bg-white/70 border border-card-border rounded px-2.5 py-1.5 hover:bg-primary/5"
              >
                <div className="flex items-center gap-2 text-xs text-text-body">
                  <span className="truncate">{String(s.title || s.model || s.id)}</span>
                  <span className="text-[10px] text-muted ml-auto shrink-0">{String(s.model || '')}</span>
                </div>
                <div className="text-[10px] text-muted mt-0.5">
                  {Number(s.input_tokens ?? 0)}→{Number(s.output_tokens ?? 0)} tok · {String(s.started_at || '')}
                </div>
              </button>
            ))}
            {sessions.length === 0 && <p className="text-xs text-muted">暂无会话</p>}
          </div>
        </div>

        {/* 技能库 */}
        <div>
          <h4 className="text-xs font-medium text-muted mb-2">技能库</h4>
          <div className="grid grid-cols-2 gap-1.5 max-h-80 overflow-auto">
            {skills.slice(0, 24).map((sk) => (
              <div key={String(sk.file)} className="bg-white/70 border border-card-border rounded p-2" title={String(sk.description || '')}>
                <p className="text-xs text-heading truncate">{String(sk.name)}</p>
                <p className="text-[10px] text-muted truncate">{String(sk.category)} · {String(sk.description || '').slice(0, 20)}</p>
              </div>
            ))}
            {skills.length === 0 && <p className="text-xs text-muted">暂无技能</p>}
          </div>
        </div>
      </div>

      {/* 启动表单 */}
      <div className="border border-card-border rounded-lg bg-white/70 p-4 space-y-3">
        <h4 className="text-xs font-medium text-muted">启动 Hermes 会话</h4>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          placeholder="指令..."
          className="w-full px-3 py-2 border border-card-border rounded-lg bg-white/80 text-sm text-text-body focus:outline-none focus:ring-2 focus:ring-accent"
        />
        <div className="flex gap-2">
          <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="模型（可选）" className="flex-1 px-2 py-1.5 border border-card-border rounded text-xs text-text-body bg-white/80 focus:outline-none focus:ring-2 focus:ring-accent" />
          <input value={skill} onChange={(e) => setSkill(e.target.value)} placeholder="技能（可选）" className="flex-1 px-2 py-1.5 border border-card-border rounded text-xs text-text-body bg-white/80 focus:outline-none focus:ring-2 focus:ring-accent" />
          <button
            onClick={() => void launch()}
            disabled={launching}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary text-white text-xs hover:bg-primary/90 disabled:opacity-50"
          >
            {launching ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />} 启动
          </button>
          {runId && (
            <button onClick={() => void abort()} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-rose-50 text-rose-600 text-xs hover:bg-rose-100">
              <Square className="w-3 h-3" /> 终止
            </button>
          )}
        </div>
        {runId && <RunOutputPanel runId={runId} />}
      </div>

      {/* 会话详情 */}
      {detail && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-6" onClick={() => setDetail(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-divider">
              <h3 className="font-heading font-semibold text-heading text-sm">会话详情</h3>
              <button onClick={() => setDetail(null)} className="p-1 hover:bg-primary/10 rounded text-muted"><X className="w-4 h-4" /></button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <div className="text-xs text-muted mb-3 space-y-1">
                <p>模型：{String(detail.model || '—')} · 消息：{String(detail.message_count ?? 0)} · 工具调用：{String(detail.tool_call_count ?? 0)}</p>
                <p>Token：{String(detail.input_tokens ?? 0)} → {String(detail.output_tokens ?? 0)} · 费用：${Number(detail.actual_cost_usd ?? 0).toFixed(4)}</p>
              </div>
              <div className="space-y-2">
                {(detail.messages as Array<Record<string, unknown>> | undefined)?.slice(-20).map((m) => (
                  <div key={String(m.id)} className="border border-card-border rounded p-2 bg-white/60">
                    <div className="text-[10px] text-muted mb-1">{String(m.role)} {m.tool_name ? `· ${String(m.tool_name)}` : ''} · {String(m.time || '')}</div>
                    <div className="text-xs text-text-body whitespace-pre-wrap max-h-40 overflow-auto">{String(m.content || '')}</div>
                  </div>
                ))}
                {!detail.messages && <p className="text-xs text-muted">无消息</p>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
