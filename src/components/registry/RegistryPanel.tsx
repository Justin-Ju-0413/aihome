'use client';

import { useCallback, useEffect, useState } from 'react';
import { SkillRow } from './SkillRow';

type Skill = {
  id: string;
  name: string;
  description: string;
  platforms: { name: string; enabled: boolean; status: string }[];
};
type DoctorIssue = { skill: string; platform: string; type: string; detail: string; fixed?: boolean };

export function RegistryPanel() {
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
    const name = window.prompt('技能名称（生成注册表 id）');
    if (!name) return;
    const sourcePath = window.prompt('源目录绝对路径（含 SKILL.md 的目录）');
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
      {error && <div className="text-sm text-red-500">{error}</div>}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => runSync()} disabled={busy} data-testid="registry-sync" className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white disabled:opacity-50">
          同步全部
        </button>
        <button onClick={() => runSync(true)} disabled={busy} data-testid="registry-sync-dryrun" className="rounded border px-3 py-1.5 text-sm disabled:opacity-50">
          试运行
        </button>
        <button onClick={() => runDoctor(false)} disabled={busy} data-testid="registry-doctor" className="rounded border px-3 py-1.5 text-sm disabled:opacity-50">
          健康检查
        </button>
        <button onClick={() => runDoctor(true)} disabled={busy} data-testid="registry-doctor-fix" className="rounded border px-3 py-1.5 text-sm disabled:opacity-50">
          修复
        </button>
        <button onClick={handleImport} disabled={busy} data-testid="registry-import" className="rounded border px-3 py-1.5 text-sm disabled:opacity-50">
          导入
        </button>
      </div>

      {issues.length > 0 && (
        <ul data-testid="registry-issues" className="space-y-1 text-sm text-amber-600">
          {issues.map((i, idx) => (
            <li key={idx}>
              [{i.type}] {i.skill}/{i.platform} — {i.detail}
              {i.fixed ? ' ✓ 已修复' : ''}
            </li>
          ))}
        </ul>
      )}

      <ul className="space-y-2">
        {skills.map((s) => (
          <SkillRow key={s.id} skill={s} />
        ))}
        {skills.length === 0 && <li className="text-sm text-gray-400">注册表为空——点「导入」从平台目录导入技能</li>}
      </ul>
    </div>
  );
}
