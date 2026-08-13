'use client';

import { useEffect, useRef, useState } from 'react';
import { Wand2, Play, Square, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useConsoleStore } from '@/stores/console-store';
import { fvApi } from '@/lib/fv/api';
import { cn } from '@/lib/utils';

const QUICK_TASKS: Array<{ label: string; task: string }> = [
  { label: '代码审查', task: '审查当前项目关键模块的代码质量，输出结构化审查报告' },
  { label: '功能实现', task: '实现一个排序算法工具函数，带完整注释和错误处理' },
  { label: '调试修复', task: '检查项目中的报错信息，定位根因并修复' },
  { label: '添加文档', task: '为项目核心模块添加 JSDoc 文档注释' },
  { label: '编写测试', task: '为项目核心模块编写单元测试，覆盖边界情况' },
  { label: '代码重构', task: '重构项目中的重复代码，保持功能不变' },
];

interface ExplainResult {
  task: string;
  taskType: string;
  taskSize: string;
  selectedProvider: string;
  selectedProviderName: string;
  selectedModel: string;
  fallbackChain: string[];
  reasons: string[];
  allScores: Array<{ provider: string; name: string; modifier: number; costPenalty: number; speedPenalty: number; historyBias: number }>;
}

interface CompositeResult {
  composite: boolean;
  parts: Array<{ task: string; type: string; provider: string; model: string; taskLabel: string; taskIcon: string }>;
}

function RunOutputPanel({ runId, onAbort }: { runId: string; onAbort: () => void }) {
  const [lines, setLines] = useState<string[]>([]);
  const cursorRef = useRef(0);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setInterval(async () => {
      try {
        const { lines: newLines, cursor } = await fvApi.runOutput(runId, cursorRef.current);
        if (newLines.length > 0) {
          cursorRef.current = cursor;
          setLines((prev) => [...prev, ...newLines].slice(-500));
        }
      } catch {
        // 输出源可能已移除
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [runId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines]);

  return (
    <div className="mt-4 border border-card-border rounded-lg overflow-hidden bg-white/70">
      <div className="flex items-center justify-between px-3 py-2 bg-primary/5 border-b border-card-border">
        <span className="text-xs font-medium text-heading">实时输出 · {runId.slice(0, 8)}</span>
        <button onClick={onAbort} className="inline-flex items-center gap-1 px-2 py-1 rounded bg-rose-50 text-rose-600 text-xs hover:bg-rose-100">
          <Square className="w-3 h-3" /> 终止
        </button>
      </div>
      <pre className="text-xs p-3 overflow-auto max-h-96 whitespace-pre-wrap text-text-body font-mono">
        {lines.length === 0 ? '等待输出...' : lines.join('\n')}
      </pre>
      <div ref={bottomRef} />
    </div>
  );
}

export function MatchTab() {
  const matchHistory = useConsoleStore((s) => s.matchHistory);
  const loadMatch = useConsoleStore((s) => s.loadMatch);
  const [task, setTask] = useState('');
  const [provider, setProvider] = useState('');
  const [model, setModel] = useState('');
  const [target, setTarget] = useState('');
  const [skill, setSkill] = useState('');
  const [cwd, setCwd] = useState('');
  const [capabilities, setCapabilities] = useState<Record<string, Record<string, unknown>> | null>(null);
  const [explain, setExplain] = useState<ExplainResult | null>(null);
  const [composite, setComposite] = useState<CompositeResult | null>(null);
  const [explainOpen, setExplainOpen] = useState(false);
  const [explaining, setExplaining] = useState(false);
  const [running, setRunning] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);

  useEffect(() => {
    void fvApi.runCapabilities().then((c) => setCapabilities(c as Record<string, Record<string, unknown>>)).catch(() => {});
  }, []);

  const analyze = async () => {
    if (!task.trim()) return toast.error('请输入任务描述');
    setExplaining(true);
    try {
      const [e, c] = await Promise.all([
        fvApi.runExplain({ task, provider: provider || undefined, model: model || undefined, skill: skill || undefined }),
        fvApi.runComposite({ task, provider: provider || undefined, model: model || undefined, target: target || undefined, skill: skill || undefined, cwd: cwd || undefined }),
      ]);
      setExplain(e as unknown as ExplainResult);
      setComposite(c as unknown as CompositeResult);
      setExplainOpen(true);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setExplaining(false);
    }
  };

  const execute = async () => {
    if (!task.trim()) return toast.error('请输入任务描述');
    try {
      const result = await fvApi.run({
        task,
        provider: provider || undefined,
        model: model || undefined,
        target: target || undefined,
        skill: skill || undefined,
        cwd: cwd || undefined,
      });
      if (result.error === 'concurrency_limit') {
        toast.error((result.message as string) || '已达并发上限');
        return;
      }
      setRunId(result.runId as string);
      setRunning(true);
      toast.success(`已派发 → ${result.providerName}${result.model ? '/' + result.model : ''}`);
      void loadMatch();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const abort = async () => {
    if (!runId) return;
    try {
      await fvApi.runAbort(runId);
      setRunning(false);
      toast.success('已终止');
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const providerEntries = capabilities ? Object.entries(capabilities) : [];
  const selProvider = provider || explain?.selectedProvider || '';

  return (
    <div className="p-6 max-w-4xl space-y-4" data-testid="match-tab">
      {/* 快捷任务 */}
      <div className="flex flex-wrap gap-2">
        {QUICK_TASKS.map((q) => (
          <button
            key={q.label}
            onClick={() => setTask(q.task)}
            className="px-3 py-1.5 rounded-full text-xs border border-card-border text-text-body hover:bg-primary/5 hover:text-primary"
          >
            {q.label}
          </button>
        ))}
      </div>

      <textarea
        value={task}
        onChange={(e) => setTask(e.target.value)}
        rows={4}
        placeholder="用自然语言描述任务，例如：审查 src/utils.ts 的代码质量并给出修复建议"
        className="w-full px-3 py-2 border border-card-border rounded-lg bg-white/80 text-sm text-text-body focus:outline-none focus:ring-2 focus:ring-accent"
        data-testid="match-task"
      />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <select value={provider} onChange={(e) => setProvider(e.target.value)} className="px-2 py-1.5 border border-card-border rounded text-xs text-text-body bg-white">
          <option value="">自动调度</option>
          <option value="claude">Claude</option>
          <option value="codex">Codex</option>
          <option value="hermes">Hermes</option>
        </select>
        <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="模型" className="px-2 py-1.5 border border-card-border rounded text-xs text-text-body bg-white/80 focus:outline-none focus:ring-2 focus:ring-accent" />
        <input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="目标文件/目录" className="px-2 py-1.5 border border-card-border rounded text-xs text-text-body bg-white/80 focus:outline-none focus:ring-2 focus:ring-accent" />
        <input value={skill} onChange={(e) => setSkill(e.target.value)} placeholder="技能 (Hermes)" className="px-2 py-1.5 border border-card-border rounded text-xs text-text-body bg-white/80 focus:outline-none focus:ring-2 focus:ring-accent" />
        <input value={cwd} onChange={(e) => setCwd(e.target.value)} placeholder="工作目录" className="px-2 py-1.5 border border-card-border rounded text-xs text-text-body bg-white/80 focus:outline-none focus:ring-2 focus:ring-accent" />
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => void analyze()}
          disabled={explaining}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-card-border text-sm text-text-body hover:bg-primary/5 disabled:opacity-50"
          data-testid="match-analyze"
        >
          {explaining ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />} 调度分析
        </button>
        <button
          onClick={() => void execute()}
          disabled={running && !runId}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-white text-sm hover:bg-primary/90 disabled:opacity-50"
          data-testid="match-execute"
        >
          <Play className="w-4 h-4" /> 执行
        </button>
      </div>

      {/* 调度分析结果 */}
      {explain && explainOpen && (
        <div className="border border-card-border rounded-lg bg-white/70 p-4 space-y-3" data-testid="match-explain">
          <div className="flex items-center gap-2">
            <h4 className="font-heading font-semibold text-heading text-sm">调度分析</h4>
            <span className="text-xs text-muted">{explain.taskType} · {explain.taskSize}</span>
            <span className="ml-auto text-xs text-primary font-medium">{explain.selectedProviderName} / {explain.selectedModel || '默认模型'}</span>
          </div>
          {composite?.composite && (
            <div className="space-y-1">
              <p className="text-xs text-muted">检测到复合任务，将拆分为 {composite.parts.length} 步：</p>
              {composite.parts.map((p, i) => (
                <div key={i} className="flex items-center gap-2 text-xs text-text-body bg-white border border-card-border rounded px-2 py-1">
                  <span>{p.taskIcon}</span>
                  <span className="truncate">{p.task}</span>
                  <span className="ml-auto text-primary shrink-0">{p.provider}{p.model ? '/' + p.model : ''}</span>
                </div>
              ))}
            </div>
          )}
          <div className="space-y-1">
            {explain.reasons.map((r, i) => (
              <p key={i} className="text-xs text-text-body">• {r}</p>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {explain.allScores.map((s) => (
              <div key={s.provider} className="border border-card-border rounded p-2 text-center bg-white/60">
                <p className="text-xs font-medium text-heading">{s.name}</p>
                <p className="text-[10px] text-muted">×{s.modifier}{s.historyBias ? ` · 历史 ${(s.historyBias * 100).toFixed(0)}%` : ''}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 实时输出 */}
      {runId && <RunOutputPanel runId={runId} onAbort={() => void abort()} />}

      {/* 能力对比 + 历史 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-divider">
        <div>
          <h4 className="text-xs font-medium text-muted mb-2">Agent 能力对比</h4>
          <div className="space-y-2">
            {providerEntries.map(([p, prof]) => (
              <div key={p} className={cn('border rounded-lg p-3 bg-white/70', selProvider === p ? 'border-primary/40' : 'border-card-border')}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-heading">{String(prof.name)}</span>
                  <span className="text-[10px] text-muted">v{String(prof.version)}</span>
                </div>
                <div className="flex gap-2 mt-1 text-[10px] text-muted flex-wrap">
                  <span>上下文 {Number(prof.maxContext) / 1000}K</span>
                  <span>速度 {String(prof.avgSpeed)}</span>
                  <span>成本 {String(prof.costLevel)}</span>
                  <span>回退 → {String(prof.fallback)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <h4 className="text-xs font-medium text-muted mb-2">匹配历史</h4>
          <div className="space-y-1.5">
            {matchHistory.slice(0, 8).map((h) => (
              <div key={Number(h.id)} className="flex items-center gap-2 text-xs text-text-body bg-white/70 border border-card-border rounded px-2 py-1.5">
                <span className="truncate">{String(h.title)}</span>
                <span className="text-muted text-[10px] ml-auto shrink-0">{String(h.created_at)}</span>
              </div>
            ))}
            {matchHistory.length === 0 && <p className="text-xs text-muted">暂无匹配历史</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
