'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { AppWindow, FolderOpen, Lock, RotateCw, Terminal, TriangleAlert } from 'lucide-react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';

interface ToolProviderInfo {
  activeProviderName: string | null;
  fileState: 'ok' | 'missing' | 'conflict' | 'unwritable' | 'locked';
  conflictDetail?: string;
  stale: boolean;
}

interface InstalledTool {
  id: string;
  name: string;
  kind: 'cli' | 'app';
  installed: boolean;
  version: string | null;
  launchPath: string | null;
  configPath: string | null;
  vaultLinked: boolean;
  provider: ToolProviderInfo | null;
}

const toolsFetcher = async (url: string): Promise<InstalledTool[]> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
};

/** /agents 的 AI 工具分区：本机已安装 AI 工具检测卡片（数据来自 GET /api/tools，vault 只读联动）。 */
export default function InstalledToolsSection() {
  const { t } = useI18n();
  const { data, error, isLoading, mutate } = useSWR<InstalledTool[]>('/api/tools', toolsFetcher);
  const [redetecting, setRedetecting] = useState(false);
  const tools = data ?? [];
  const detecting = isLoading || redetecting;

  useEffect(() => {
    if (error) toast.error(t('tools.section.detectFailed'));
  }, [error, t]);

  const redetect = async () => {
    try {
      setRedetecting(true);
      await mutate(toolsFetcher('/api/tools?refresh=1'), { revalidate: false });
    } catch {
      toast.error(t('tools.section.detectFailed'));
    } finally {
      setRedetecting(false);
    }
  };

  const openTool = async (toolId: string) => {
    try {
      const res = await fetch('/api/tools/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toolId }),
      });
      if (res.status === 501) {
        toast.error(t('tools.notAvailable'));
      } else if (!res.ok) {
        toast.error(t('tools.openFailed'));
      }
    } catch {
      toast.error(t('tools.openFailed'));
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="px-6 pb-4 text-center">
        <p className="text-sm text-muted">{t('tools.section.subtitle', { count: tools.length })}</p>
        <div className="flex items-center justify-center mt-4">
          <button
            onClick={() => void redetect()}
            disabled={detecting}
            data-testid="tools-redetect"
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-card-border rounded-lg glass-input hover:bg-primary/10 disabled:opacity-50 text-text-body"
          >
            <RotateCw className={cn('w-4 h-4', detecting && 'animate-spin')} />
            {detecting ? t('tools.section.detecting') : t('tools.section.refresh')}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {tools.map(tool => (
            <div
              key={tool.id}
              data-testid="tools-card"
              data-tool-id={tool.id}
              className="glass-panel rounded-lg border border-card-border p-5 flex flex-col"
            >
              <div className="flex items-center gap-2 mb-3">
                <span className="px-2 py-0.5 rounded-full text-xs font-medium flex items-center gap-1 bg-primary/10 text-primary">
                  {tool.kind === 'cli' ? <Terminal className="w-3 h-3" /> : <AppWindow className="w-3 h-3" />}
                  {tool.kind === 'cli' ? t('tools.kind.cli') : t('tools.kind.app')}
                </span>
                <span className={cn(
                  'px-2 py-0.5 rounded-full text-xs font-medium',
                  tool.installed ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-card-border/40 text-muted'
                )}>
                  {tool.installed ? t('tools.installed') : t('tools.notInstalled')}
                </span>
              </div>

              <h3 className="font-heading font-semibold text-heading mb-1">{tool.name}</h3>
              {tool.installed && tool.version && (
                <p className="text-xs text-muted">{t('tools.version', { version: tool.version })}</p>
              )}

              <div className="mt-3 space-y-1.5 text-xs text-muted">
                <p className="truncate" title={tool.configPath ?? undefined}>
                  {tool.configPath ? `${t('tools.config')}: ${tool.configPath}` : t('tools.noConfig')}
                </p>
                {tool.installed && tool.launchPath && (
                  <p className="truncate" title={tool.launchPath}>{tool.launchPath}</p>
                )}
              </div>

              {(tool.vaultLinked || tool.installed) && (
                <div className="mt-auto pt-3 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    {tool.vaultLinked ? <ProviderBadge tool={tool} /> : <span />}
                  </div>
                  <button
                    onClick={() => openTool(tool.id)}
                    disabled={!tool.installed}
                    data-testid={`tools-open-${tool.id}`}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-primary border border-card-border rounded-lg hover:bg-primary/10 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                    {t('tools.open')}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ProviderBadge({ tool }: { tool: InstalledTool }) {
  const { t } = useI18n();
  const provider = tool.provider;

  if (!provider || provider.fileState === 'locked') {
    return (
      <Link href="/vault" className="flex items-center gap-1.5 text-xs text-muted hover:text-primary min-w-0">
        <Lock className="w-3 h-3 shrink-0" />
        <span className="truncate">{t('tools.vaultLocked')} · {t('tools.goVault')}</span>
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-1.5 min-w-0 text-xs">
      <span className={cn(
        'px-2 py-0.5 rounded-full font-medium truncate max-w-[10rem]',
        provider.activeProviderName ? 'bg-secondary/20 text-primary' : 'bg-card-border/40 text-muted'
      )}>
        {provider.activeProviderName ?? t('tools.providerNone')}
      </span>
      {provider.stale && (
        <span title={t('tools.staleWarning')}>
          <TriangleAlert className="w-3.5 h-3.5 text-amber-500 shrink-0" />
        </span>
      )}
      {provider.fileState === 'conflict' && (
        <span className="text-red-500 truncate" title={provider.conflictDetail}>{t('tools.staleWarning')}</span>
      )}
    </div>
  );
}
