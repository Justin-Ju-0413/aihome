'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Sparkles,
  FolderOpen,
  ScanSearch,
  Save,
  Check,
  ChevronLeft,
  ArrowRight,
  FolderHeart,
  Orbit,
  Gem,
} from 'lucide-react';
import { toast } from 'sonner';
import { useI18n, type DictKey } from '@/lib/i18n';

type PreviewResult = {
  count: number;
  agents: Array<{ id: string; name: string; type: string }>;
  errors: string[];
};

export default function OnboardingPage() {
  const router = useRouter();
  const { t } = useI18n();
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
      toast.error(t('onboarding.noPathsError'));
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
      if (res.ok === false) throw new Error(data.error);
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
      if (res.ok === false) throw new Error(t('onboarding.saveFailed'));
      toast.success(t('onboarding.saveSuccess'));
      router.push('/board');
    } catch {
      toast.error(t('onboarding.saveFailed'));
    } finally {
      setBusy(false);
    }
  }

  const steps: Array<{ key: DictKey; icon: typeof FolderHeart }> = [
    { key: 'onboarding.stepChooseDir', icon: FolderHeart },
    { key: 'onboarding.stepPreview', icon: Orbit },
    { key: 'onboarding.stepSave', icon: Gem },
  ];

  const inputCls =
    'w-full rounded-xl border border-divider/70 bg-white/60 dark:bg-white/5 px-4 py-3 font-mono text-sm text-text-body shadow-inner focus:outline-none focus:ring-2 focus:ring-accent/60 transition-all';

  const ghostBtnCls =
    'inline-flex items-center gap-1.5 rounded-xl border border-divider bg-white/50 dark:bg-white/5 px-4 py-2 text-sm text-text-body hover:border-accent/50 hover:text-primary transition-all';

  const primaryBtnCls =
    'inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-primary to-accent px-5 py-2 text-sm font-medium text-white shadow-lg shadow-primary/20 hover:shadow-primary/40 disabled:opacity-50 disabled:hover:shadow-lg transition-all';

  return (
    <main className="relative flex min-h-[100svh] items-center justify-center overflow-hidden px-6 py-10">
      {/* 艺术氛围光斑 */}
      <div aria-hidden className="pointer-events-none absolute -left-24 -top-24 h-96 w-96 rounded-full bg-primary/25 blur-3xl onb-orb-slow" />
      <div aria-hidden className="pointer-events-none absolute -right-28 top-10 h-[26rem] w-[26rem] rounded-full bg-accent/20 blur-3xl onb-orb-slower" />
      <div aria-hidden className="pointer-events-none absolute bottom-[-10rem] left-1/3 h-96 w-96 rounded-full bg-secondary/25 blur-3xl onb-orb-slow" />
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/40 blur-3xl dark:bg-white/5" />

      {/* 主卡片 */}
      <div className="relative w-full max-w-xl onb-fade-up">
        <div className="glass-modal rounded-[2rem] p-7 sm:p-10 shadow-2xl">
          {/* 艺术化头部 */}
          <div className="mb-9 text-center">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-[1.4rem] bg-gradient-to-br from-primary via-accent to-secondary text-white shadow-xl shadow-primary/25 ring-1 ring-white/40 dark:ring-white/15">
              <Sparkles className="h-8 w-8" />
            </div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.35em] text-secondary">
              {t('onboarding.kicker')}
            </p>
            <h1 className="font-heading text-3xl sm:text-4xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-primary via-accent to-secondary onb-shimmer">
              {t('onboarding.welcome')}
            </h1>
            <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-muted">
              {t('onboarding.intro')}
            </p>
          </div>

          {/* 步骤指示器 */}
          <div className="mb-9">
            <ol className="flex items-center">
              {steps.map((s, i) => {
                const active = step >= i + 1;
                const done = step > i + 1;
                const Icon = s.icon;
                return (
                  <li key={s.key} className="flex flex-1 items-center last:flex-none">
                    <div className="flex flex-col items-center">
                      <span
                        className={`flex h-10 w-10 items-center justify-center rounded-full border text-white transition-all duration-300 ${
                          active
                            ? 'border-transparent bg-gradient-to-br from-primary to-accent shadow-lg shadow-primary/25'
                            : 'border-divider bg-white/50 text-muted dark:bg-white/5'
                        }`}
                      >
                        {done ? <Check className="h-5 w-5" /> : <Icon className="h-[1.15rem] w-[1.15rem]" />}
                      </span>
                      <span
                        className={`mt-2 max-w-[4.5rem] text-center text-[11px] font-medium leading-tight ${
                          active ? 'text-primary' : 'text-muted'
                        }`}
                      >
                        {t(s.key)}
                      </span>
                    </div>
                    {i < steps.length - 1 && (
                      <div
                        className={`mx-2 mb-5 h-px flex-1 rounded-full transition-colors duration-300 ${
                          done ? 'bg-gradient-to-r from-primary to-accent' : 'bg-divider'
                        }`}
                      />
                    )}
                  </li>
                );
              })}
            </ol>
          </div>

          {/* 步骤内容 */}
          <div className="glass-panel rounded-2xl p-6">
            {step === 1 && (
              <div className="space-y-4">
                <label className="block text-sm font-medium text-text-body">
                  {t('onboarding.workspaceDirLabel')}
                </label>
                <textarea
                  value={pathsText}
                  onChange={(e) => setPathsText(e.target.value)}
                  rows={4}
                  data-testid="onboarding-paths"
                  placeholder={'/Users/me/agents\n/Users/me/skills'}
                  className={inputCls}
                />
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setStep(2)}
                    disabled={parsePaths().length === 0}
                    data-testid="onboarding-next"
                    className={primaryBtnCls}
                  >
                    {t('common.next')} <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <ul className="divide-y divide-divider rounded-xl border border-divider/70 bg-white/40 dark:bg-white/5">
                  {parsePaths().map((p) => (
                    <li
                      key={p}
                      className="flex items-center gap-2 px-4 py-3 font-mono text-sm text-text-body"
                    >
                      <FolderOpen className="h-4 w-4 shrink-0 text-secondary" /> {p}
                    </li>
                  ))}
                </ul>
                <div className="flex justify-between gap-2">
                  <button onClick={() => setStep(1)} className={ghostBtnCls}>
                    <ChevronLeft className="h-4 w-4" /> {t('common.back')}
                  </button>
                  <button
                    onClick={handlePreview}
                    disabled={busy}
                    data-testid="onboarding-preview"
                    className={primaryBtnCls}
                  >
                    <ScanSearch className="h-4 w-4" /> {busy ? '···' : t('onboarding.stepPreview')}
                  </button>
                </div>
              </div>
            )}

            {step === 3 && preview && (
              <div className="space-y-4">
                <div className="rounded-xl border border-divider/70 bg-white/40 p-5 text-sm dark:bg-white/5">
                  <p className="flex items-center gap-2 font-semibold text-heading" data-testid="onboarding-count">
                    <Gem className="h-4 w-4 text-secondary" />
                    {t('onboarding.foundCount', { n: preview.count })}
                  </p>

                  {preview.agents.length > 0 && (
                    <ul className="mt-3 max-h-44 space-y-1 overflow-auto pr-1 text-xs text-muted">
                      {preview.agents.map((a) => (
                        <li
                          key={a.id}
                          className="flex items-center gap-2 rounded-lg px-2 py-1 font-mono hover:bg-primary/5"
                        >
                          <span
                            className={`inline-flex h-4 items-center rounded-full px-1.5 text-[10px] font-semibold uppercase tracking-wide ${
                              a.type === 'skill' ? 'bg-secondary/15 text-secondary' : 'bg-primary/15 text-primary'
                            }`}
                          >
                            {a.type}
                          </span>
                          {a.name}
                        </li>
                      ))}
                    </ul>
                  )}

                  {preview.errors.length > 0 && (
                    <ul className="mt-3 space-y-1 text-xs text-amber-600">
                      {preview.errors.map((e, i) => (
                        <li key={i}>{e}</li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="flex justify-between gap-2">
                  <button onClick={() => setStep(2)} className={ghostBtnCls}>
                    <ChevronLeft className="h-4 w-4" /> {t('common.back')}
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={busy}
                    data-testid="onboarding-save"
                    className={primaryBtnCls}
                  >
                    <Save className="h-4 w-4" /> {t('common.saveWorkspace')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-muted/80">AIHome · local-first agent workspace</p>
      </div>
    </main>
  );
}
