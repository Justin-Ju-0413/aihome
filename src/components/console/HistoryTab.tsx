'use client';

import { useMemo, useState } from 'react';
import { History } from 'lucide-react';
import { useConsoleStore } from '@/stores/console-store';
import { cn } from '@/lib/utils';

const TYPE_META: Record<string, { label: string; color: string }> = {
  edit: { label: '编辑', color: 'bg-primary/10 text-primary' },
  agent: { label: 'Agent', color: 'bg-emerald-50 text-emerald-700' },
  create: { label: '创建', color: 'bg-sky-50 text-sky-700' },
  delete: { label: '删除', color: 'bg-rose-50 text-rose-600' },
};

function groupByDay(rows: Array<{ created_at: string; id: number }>): Array<{ day: string; items: Array<Record<string, unknown>> }> {
  const groups: Array<{ day: string; items: Array<Record<string, unknown>> }> = [];
  const map = new Map<string, Array<Record<string, unknown>>>();
  for (const r of rows) {
    const d = new Date(String(r.created_at).replace(' ', 'T'));
    const today = new Date();
    const yesterday = new Date(Date.now() - 86400000);
    let key: string;
    if (d.toDateString() === today.toDateString()) key = '今天';
    else if (d.toDateString() === yesterday.toDateString()) key = '昨天';
    else key = d.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(r);
  }
  for (const [day, items] of map) groups.push({ day, items });
  return groups;
}

export function HistoryTab() {
  const history = useConsoleStore((s) => s.history);
  const [filter, setFilter] = useState<'all' | string>('all');

  const filtered = useMemo(
    () => (filter === 'all' ? history : history.filter((h) => h.type === filter)),
    [history, filter]
  );
  const groups = useMemo(() => groupByDay(filtered as Array<{ created_at: string; id: number }>), [filtered]);

  return (
    <div className="p-6 max-w-3xl" data-testid="history-tab">
      <div className="flex gap-2 mb-4">
        {['all', 'edit', 'agent', 'create', 'delete'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              'px-2.5 py-1 rounded-full text-xs border',
              filter === f ? 'bg-primary/10 text-primary border-primary/30' : 'text-muted border-card-border hover:text-primary'
            )}
          >
            {f === 'all' ? '全部' : TYPE_META[f]?.label || f}
          </button>
        ))}
      </div>

      <div className="space-y-5">
        {groups.map((g) => (
          <div key={g.day}>
            <h4 className="text-xs font-medium text-muted mb-2">{g.day}</h4>
            <div className="bg-white rounded-lg border border-card-border divide-y divide-divider">
              {g.items.map((item) => {
                const meta = TYPE_META[String(item.type)] || { label: String(item.type), color: 'bg-muted/20 text-muted' };
                return (
                  <div key={Number(item.id)} className="flex items-start gap-3 px-4 py-2.5">
                    <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0 mt-0.5', meta.color)}>
                      {meta.label}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm text-text-body truncate">{String(item.title)}</p>
                      {item.description ? <p className="text-xs text-muted truncate">{String(item.description)}</p> : null}
                    </div>
                    <span className="text-[10px] text-muted ml-auto shrink-0">
                      {new Date(String(item.created_at).replace(' ', 'T')).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        {groups.length === 0 && (
          <div className="text-center py-16">
            <History className="w-12 h-12 text-card-border mx-auto mb-3" />
            <p className="text-muted text-sm">暂无历史记录</p>
          </div>
        )}
      </div>
    </div>
  );
}
