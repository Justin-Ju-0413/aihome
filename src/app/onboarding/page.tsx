'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FolderOpen, ScanSearch, Save, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';

type PreviewResult = {
  count: number;
  agents: Array<{ id: string; name: string; type: string }>;
  errors: string[];
};

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [pathsText, setPathsText] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<PreviewResult | null>(null);

  function parsePaths(): string[] {
    return pathsText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  async function handlePreview() {
    const paths = parsePaths();
    if (paths.length === 0) {
      toast.error('请至少输入一个目录路径');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/workspace/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPreview(data);
      setStep(3);
    } catch (e) {
      toast.error(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  }

  async function handleSave() {
    const paths = parsePaths();
    setBusy(true);
    try {
      const res = await fetch('/api/workspace', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths }),
      });
      if (!res.ok) throw new Error('保存失败');
      toast.success('工作区已保存');
      router.push('/board');
    } catch {
      toast.error('保存失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="mb-2 text-2xl font-bold">欢迎使用 AIHome</h1>
      <p className="mb-6 text-sm text-gray-500">首次使用：选择存放 agent 定义（AGENTS.md / SKILL.md）的目录。</p>

      <ol className="mb-6 flex items-center gap-2 text-sm">
        {['选择目录', '预览扫描', '保存'].map((label, i) => (
          <li key={label} className="flex items-center gap-2">
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                step >= i + 1 ? 'bg-primary text-white' : 'bg-gray-100 text-gray-500'
              }`}
            >
              {i + 1}
            </span>
            <span className={step >= i + 1 ? 'text-text-body' : 'text-gray-400'}>{label}</span>
            {i < 2 && <ChevronRight className="w-4 h-4 text-gray-300" />}
          </li>
        ))}
      </ol>

      {step === 1 && (
        <div className="space-y-4">
          <label className="block text-sm font-medium">工作区目录（每行一个绝对路径）</label>
          <textarea
            value={pathsText}
            onChange={(e) => setPathsText(e.target.value)}
            rows={4}
            data-testid="onboarding-paths"
            placeholder={'/Users/me/agents\n/Users/me/skills'}
            className="w-full rounded border border-card-border p-3 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          />
          <div className="flex gap-2">
            <button
              onClick={() => setStep(2)}
              disabled={parsePaths().length === 0}
              className="rounded bg-primary px-4 py-2 text-sm text-white disabled:opacity-50 flex items-center gap-1"
            >
              下一步 <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <ul className="rounded border border-card-border divide-y divide-divider">
            {parsePaths().map((p) => (
              <li key={p} className="px-3 py-2 font-mono text-sm flex items-center gap-2">
                <FolderOpen className="w-4 h-4 text-muted" /> {p}
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <button
              onClick={() => setStep(1)}
              className="rounded border px-4 py-2 text-sm flex items-center gap-1"
            >
              <ChevronLeft className="w-4 h-4" /> 返回
            </button>
            <button
              onClick={handlePreview}
              disabled={busy}
              data-testid="onboarding-preview"
              className="rounded bg-primary px-4 py-2 text-sm text-white disabled:opacity-50 flex items-center gap-1"
            >
              <ScanSearch className="w-4 h-4" /> 预览扫描
            </button>
          </div>
        </div>
      )}

      {step === 3 && preview && (
        <div className="space-y-4">
          <div className="rounded border border-card-border p-4 text-sm">
            <p className="font-medium" data-testid="onboarding-count">
              发现 {preview.count} 个 agent/skill
            </p>
            {preview.agents.length > 0 && (
              <ul className="mt-2 max-h-40 overflow-auto space-y-0.5 text-xs text-gray-500">
                {preview.agents.map((a) => (
                  <li key={a.id} className="font-mono">
                    [{a.type}] {a.name}
                  </li>
                ))}
              </ul>
            )}
            {preview.errors.length > 0 && (
              <ul className="mt-2 space-y-0.5 text-xs text-amber-600">
                {preview.errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setStep(2)}
              className="rounded border px-4 py-2 text-sm flex items-center gap-1"
            >
              <ChevronLeft className="w-4 h-4" /> 返回
            </button>
            <button
              onClick={handleSave}
              disabled={busy}
              data-testid="onboarding-save"
              className="rounded bg-primary px-4 py-2 text-sm text-white disabled:opacity-50 flex items-center gap-1"
            >
              <Save className="w-4 h-4" /> 保存工作区
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
