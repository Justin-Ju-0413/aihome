'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Bot, Sparkles, Search, Grid, List, RefreshCw } from 'lucide-react';
import { useAppStore } from '@/stores/app-store';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';

/** /agents 的 Markdown Agents 分区：原 agents 列表页逻辑原样迁移（store 接线不变，/board 共用 agents slice）。 */
export default function MarkdownAgentsSection() {
  const { t } = useI18n();
  const { agents, setAgents, setIsScanning, isScanning } = useAppStore();
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [search, setSearch] = useState('');
  const [fullText, setFullText] = useState(false);
  const [fullTextResults, setFullTextResults] = useState<typeof agents | null>(null);

  const loadAgents = useCallback(async () => {
    try {
      setIsScanning(true);
      const res = await fetch('/api/agents');
      const data = await res.json();
      setAgents(data);
    } catch {
      toast.error(t('agents.page.loadFailed'));
    } finally {
      setIsScanning(false);
    }
  }, [setAgents, setIsScanning, t]);

  useEffect(() => {
    loadAgents();
  }, [loadAgents]);

  // 全文模式：服务端按 markdown 正文匹配（debounce 300ms），结果只影响本页
  useEffect(() => {
    if (!fullText) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 全文模式切换重置
      setFullTextResults(null);
      return;
    }
    const q = search.trim();
    if (!q) {
      setFullTextResults(null);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/agents?q=${encodeURIComponent(q)}&full=1`);
        const data = await res.json();
        setFullTextResults(data);
      } catch {
        setFullTextResults(null);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [search, fullText]);

  // 全文模式直接用服务端结果（避免本地 name/desc 二次过滤误删正文命中项）
  const filteredAgents = fullText && fullTextResults !== null
    ? fullTextResults
    : agents.filter(a =>
        !search || a.name.toLowerCase().includes(search.toLowerCase()) ||
        a.description.toLowerCase().includes(search.toLowerCase())
      );

  return (
    <div className="h-full flex flex-col">
      <div className="px-6 pb-4 text-center">
        <p className="text-sm text-muted">{t('agents.page.found', { count: agents.length })}</p>

        <div className="flex items-center justify-center gap-3 mt-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
            <input
              type="text"
              placeholder={t('agents.page.searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 pr-4 py-2 border border-card-border rounded-lg w-64 glass-input focus:outline-none focus:ring-2 focus:ring-accent text-text-body placeholder:text-muted"
            />
          </div>
          <label className="flex items-center gap-1.5 text-sm text-text-body cursor-pointer select-none">
            <input
              type="checkbox"
              checked={fullText}
              onChange={(e) => setFullText(e.target.checked)}
              data-testid="agents-fulltext"
              className="accent-primary"
            />
            {t('agents.page.fullText')}
          </label>
          <div className="flex border border-card-border rounded-lg glass-input" data-testid="agents-view-toggle">
            <button
              onClick={() => setViewMode('grid')}
              className={cn('p-2', viewMode === 'grid' ? 'bg-primary/10 text-primary' : 'text-muted')}
            >
              <Grid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={cn('p-2', viewMode === 'list' ? 'bg-primary/10 text-primary' : 'text-muted')}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
          <button
            onClick={loadAgents}
            disabled={isScanning}
            data-testid="agents-rescan"
            className="p-2 hover:bg-primary/10 rounded-lg disabled:opacity-50 text-text-body"
          >
            <RefreshCw className={`w-5 h-5 ${isScanning ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredAgents.map(agent => (
              <Link
                key={agent.id}
                href={`/agents/${agent.id}`}
                className="glass-panel rounded-lg border border-card-border p-5 hover:shadow-md transition-shadow"
              >
                <div className="flex items-center gap-2 mb-3">
                  <span className={cn(
                    'px-2 py-0.5 rounded-full text-xs font-medium flex items-center gap-1',
                    agent.type === 'skill' ? 'bg-secondary/20 text-primary' : 'bg-primary/10 text-primary'
                  )}>
                    {agent.type === 'skill' ? <Sparkles className="w-3 h-3" /> : <Bot className="w-3 h-3" />}
                    {agent.type}
                  </span>
                  <span className="text-xs text-muted">•</span>
                  <span className="text-xs text-muted">{agent.status}</span>
                </div>
                <h3 className="font-heading font-semibold text-heading mb-1">{agent.name}</h3>
                <p className="text-sm text-text-body line-clamp-2">{agent.description}</p>
                <div className="mt-3 text-xs text-muted">
                  {t('agents.page.filesDir', { count: agent.associatedFiles.total, dir: agent.dirPath.split('/').pop() || '' })}
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="glass-panel rounded-lg border border-card-border overflow-hidden">
            <table className="w-full">
              <thead className="bg-primary/5 border-b border-card-border">
                <tr>
                  <th className="text-left px-4 py-3 text-sm font-medium text-muted">{t('common.name')}</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-muted">{t('board.list.type')}</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-muted">{t('common.description')}</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-muted">{t('common.files')}</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-muted">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-divider">
                {filteredAgents.map(agent => (
                  <tr key={agent.id} className="hover:bg-primary/5">
                    <td className="px-4 py-3">
                      <Link href={`/agents/${agent.id}`} className="font-medium text-heading hover:text-primary">
                        {agent.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        'px-2 py-0.5 rounded-full text-xs font-medium',
                        agent.type === 'skill' ? 'bg-secondary/20 text-primary' : 'bg-primary/10 text-primary'
                      )}>
                        {agent.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-text-body max-w-xs truncate">{agent.description}</td>
                    <td className="px-4 py-3 text-sm text-muted">{agent.associatedFiles.total}</td>
                    <td className="px-4 py-3">
                      <Link href={`/agents/${agent.id}`} className="text-primary hover:text-accent text-sm">
                        {t('common.edit')}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {filteredAgents.length === 0 && (
          <div className="text-center py-12">
            <Bot className="w-12 h-12 text-card-border mx-auto mb-4" />
            <p className="text-muted">{t('agents.page.noResults')}</p>
            <p className="text-sm text-muted mt-1">{t('agents.page.emptyHint')}</p>
          </div>
        )}
      </div>
    </div>
  );
}
