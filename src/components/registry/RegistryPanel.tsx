'use client';

import { useCallback, useEffect, useState } from 'react';
import { SkillRow } from './SkillRow';
import { useI18n } from '@/lib/i18n';
import { Button } from '@/components/ui/Button';

type Skill = {
  id: string;
  name: string;
  description: string;
  platforms: { name: string; enabled: boolean; status: string }[];
};
type DoctorIssue = { skill: string; platform: string; type: string; detail: string; fixed?: boolean };

export function RegistryPanel() {
  const { t } = useI18n();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [issues, setIssues] = useState<DoctorIssue[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/registry/skills');
      const data = await res.json();
      setSkills(data.skills ?? []);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch registry on mount
    void refresh();
  }, [refresh]);

  async function runSync(dryRun = false) {
    setBusy(true);
    try {
      const res = await fetch(`/api/registry/sync${dryRun ? '?dryRun=true' : ''}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      await res.json();
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function runDoctor(fix = false) {
    setBusy(true);
    try {
      const res = await fetch(fix ? '/api/registry/doctor/fix' : '/api/registry/doctor', {
        method: fix ? 'POST' : 'GET',
      });
      const data = await res.json();
      setIssues(data.issues ?? []);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleImport() {
    const name = window.prompt(t('registry.importNamePrompt'));
    if (!name) return;
    const sourcePath = window.prompt(t('registry.importSourcePrompt'));
    if (!sourcePath) return;
    try {
      await fetch('/api/registry/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, sourcePath }),
      });
      await refresh();
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <div className="space-y-4">
      {error && <div className="text-sm text-red-600 dark:text-red-400">{error}</div>}
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => runSync()} disabled={busy} data-testid="registry-sync" size="sm">
          {t('common.syncAll')}
        </Button>
        <Button onClick={() => runSync(true)} disabled={busy} data-testid="registry-sync-dryrun" variant="secondary" size="sm">
          {t('common.dryRun')}
        </Button>
        <Button onClick={() => runDoctor(false)} disabled={busy} data-testid="registry-doctor" variant="secondary" size="sm">
          {t('common.healthCheck')}
        </Button>
        <Button onClick={() => runDoctor(true)} disabled={busy} data-testid="registry-doctor-fix" variant="secondary" size="sm">
          {t('common.fix')}
        </Button>
        <Button onClick={handleImport} disabled={busy} data-testid="registry-import" variant="secondary" size="sm">
          {t('common.import')}
        </Button>
      </div>

      {issues.length > 0 && (
        <ul data-testid="registry-issues" className="space-y-1 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
          {issues.map((i, idx) => (
            <li key={idx}>
              [{i.type}] {i.skill}/{i.platform} — {i.detail}
              {i.fixed ? t('registry.fixed') : ''}
            </li>
          ))}
        </ul>
      )}

      <ul className="space-y-2">
        {skills.map((s) => (
          <SkillRow key={s.id} skill={s} />
        ))}
        {skills.length === 0 && <li className="text-sm text-muted">{t('registry.empty')}</li>}
      </ul>
    </div>
  );
}
