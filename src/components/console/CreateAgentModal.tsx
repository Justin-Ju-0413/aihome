'use client';

import { useMemo, useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useConsoleStore } from '@/stores/console-store';
import { fvApi } from '@/lib/fv/api';
import type { FvTemplate } from '@/lib/fv/types';

const CATEGORY_NAMES: Record<string, string> = {
  paper: '论文', ppt: 'PPT', code: '代码', general: '通用',
};

export function CreateAgentModal() {
  const templates = useConsoleStore((s) => s.templates);
  const setCreateModalOpen = useConsoleStore((s) => s.setCreateModalOpen);
  const [templateId, setTemplateId] = useState('');
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [name, setName] = useState('');
  const [provider, setProvider] = useState('claude');
  const [prompt, setPrompt] = useState('');
  const [cwd, setCwd] = useState(process.cwd());
  const [target, setTarget] = useState('');
  const [steps, setSteps] = useState('');
  const [saving, setSaving] = useState(false);

  const grouped = useMemo(() => {
    const map: Record<string, FvTemplate[]> = {};
    for (const t of templates) {
      if (!map[t.category]) map[t.category] = [];
      map[t.category].push(t);
    }
    return map;
  }, [templates]);

  const selectedTemplate = templates.find((t) => t.id === templateId);

  const selectTemplate = (id: string) => {
    setTemplateId(id);
    setVariables({});
    const tpl = templates.find((t) => t.id === id);
    if (tpl) {
      setName(tpl.name);
      setProvider(tpl.provider);
      setPrompt(tpl.prompt);
      setSteps(tpl.steps.join('\n'));
    }
  };

  const create = async () => {
    if (!name.trim()) return toast.error('请输入名称');
    if (!prompt.trim()) return toast.error('请输入提示词');
    setSaving(true);
    try {
      let finalPrompt = prompt;
      if (selectedTemplate) {
        const rendered = await fvApi.applyTemplate(selectedTemplate.id, variables);
        finalPrompt = rendered.prompt;
        if (!name.trim()) setName(rendered.name);
        if (!steps.trim()) setSteps(rendered.steps.join('\n'));
      }
      const { id } = await fvApi.createAgent({
        name, provider, description: prompt.slice(0, 200),
        target: target.trim(), cwd: cwd.trim() || process.cwd(), prompt: finalPrompt,
        steps: steps.split('\n').map((s) => s.trim()).filter(Boolean),
      });
      toast.success(`${name} 已创建`);
      void useConsoleStore.getState().loadAgents();
      void useConsoleStore.getState().loadTemplates();
      // 按设置自动启动
      try {
        await fvApi.startAgent(id);
        toast.success(`${name} 已启动`);
        void useConsoleStore.getState().loadAgents();
      } catch (err) {
        toast.error(`创建成功但启动失败: ${(err as Error).message}`);
      }
      setCreateModalOpen(false);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'w-full px-3 py-2 border border-card-border rounded-lg glass-input text-sm text-text-body focus:outline-none focus:ring-2 focus:ring-accent';

  return (
    <div className="fixed inset-0 scrim z-50 flex items-center justify-center p-6" onClick={() => setCreateModalOpen(false)}>
      <div className="glass-modal rounded-xl shadow-xl w-full max-w-2xl max-h-[88vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-divider">
          <h3 className="font-heading font-semibold text-heading">创建 Agent</h3>
          <button onClick={() => setCreateModalOpen(false)} className="p-1 hover:bg-primary/10 rounded text-muted">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-4 space-y-3">
          {/* 模板选择 */}
          <div>
            <label className="text-xs text-muted mb-1 block">模板（可选）</label>
            <select
              value={templateId}
              onChange={(e) => selectTemplate(e.target.value)}
              className={inputCls}
              data-testid="agent-template"
            >
              <option value="">-- 自定义 --</option>
              {Object.entries(grouped).map(([cat, tpls]) => (
                <optgroup key={cat} label={CATEGORY_NAMES[cat] || cat}>
                  {tpls.map((t) => (
                    <option key={t.id} value={t.id}>{t.name} ({t.provider})</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          {/* 模板变量 */}
          {selectedTemplate && selectedTemplate.variables.length > 0 && (
            <div className="border border-card-border rounded-lg bg-primary/5 p-3 space-y-2">
              <p className="text-xs text-muted">模板变量</p>
              {selectedTemplate.variables.map((v) => (
                <input
                  key={v}
                  value={variables[v] || ''}
                  onChange={(e) => setVariables({ ...variables, [v]: e.target.value })}
                  placeholder={v}
                  className={inputCls}
                />
              ))}
            </div>
          )}

          <div>
            <label className="text-xs text-muted mb-1 block">名称</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Agent 名称" className={inputCls} />
          </div>

          <div>
            <label className="text-xs text-muted mb-1 block">Provider</label>
            <div className="flex gap-2">
              {['claude', 'codex'].map((p) => (
                <button
                  key={p}
                  onClick={() => setProvider(p)}
                  className={provider === p ? 'px-3 py-1.5 rounded-lg bg-primary text-white text-xs' : 'px-3 py-1.5 rounded-lg border border-card-border text-xs text-muted'}
                >
                  {p === 'claude' ? 'Claude Code' : 'Codex CLI'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs text-muted mb-1 block">提示词</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={5}
              placeholder="给 Agent 的指令..."
              className={inputCls}
            />
          </div>

          <div>
            <label className="text-xs text-muted mb-1 block">工作目录</label>
            <input value={cwd} onChange={(e) => setCwd(e.target.value)} className={inputCls} />
          </div>

          <div>
            <label className="text-xs text-muted mb-1 block">目标文件/目录（可选，逗号分隔）</label>
            <input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="如 src/utils.ts, src/components" className={inputCls} />
          </div>

          <div>
            <label className="text-xs text-muted mb-1 block">步骤（每行一个，可选）</label>
            <textarea
              value={steps}
              onChange={(e) => setSteps(e.target.value)}
              rows={3}
              placeholder={'读取文件\n修改代码\n验证语法'}
              className={inputCls}
            />
          </div>
        </div>

        <div className="px-4 py-3 border-t border-divider flex justify-end gap-2">
          <button onClick={() => setCreateModalOpen(false)} className="px-3 py-1.5 rounded-lg text-sm text-muted hover:bg-primary/5">取消</button>
          <button
            onClick={() => void create()}
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-white text-sm hover:bg-primary/90 disabled:opacity-50"
            data-testid="create-agent-submit"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} 创建并启动
          </button>
        </div>
      </div>
    </div>
  );
}
