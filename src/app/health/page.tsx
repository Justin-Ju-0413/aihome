'use client';

import { useCallback, useEffect, useState } from 'react';
import { HeartPulse, RefreshCw, CheckCircle2, AlertTriangle } from 'lucide-react';
import type { HealthIssue } from '@/lib/health';

export default function HealthPage() {
  const [issues, setIssues] = useState<HealthIssue[] | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const res = await fetch('/api/health/workspace');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setIssues(data.issues ?? []);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 挂载时拉取健康状态
    load();
  }, [load]);

  const healthy = issues !== null && issues.length === 0;

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="mb-2 text-xl font-semibold flex items-center gap-2">
        <HeartPulse className="w-5 h-5 text-primary" /> 工作区健康
      </h1>
      <p className="mb-4 text-sm text-gray-500">校验工作区：不可读路径、扫描/解析错误、重名 agent。</p>

      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={load}
          data-testid="health-refresh"
          className="rounded border px-3 py-1.5 text-sm disabled:opacity-50"
        >
          <RefreshCw className="w-4 h-4 inline mr-1" />
          重新检查
        </button>
        {healthy && (
          <span className="text-sm text-green-600 flex items-center gap-1" data-testid="health-ok">
            <CheckCircle2 className="w-4 h-4" /> 一切正常
          </span>
        )}
      </div>

      {error && <div className="text-sm text-red-500">无法获取健康状态</div>}

      {issues !== null && issues.length > 0 && (
        <ul data-testid="health-issues" className="space-y-2">
          {issues.map((i, idx) => (
            <li key={idx} className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <span className="font-medium flex items-center gap-1">
                <AlertTriangle className="w-4 h-4" />
                {i.type === 'unreadable_path' ? '路径不可读' : i.type === 'scan_error' ? '扫描/解析错误' : '重名 agent'}
              </span>
              <span className="mt-1 block font-mono text-xs">{i.detail}</span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
