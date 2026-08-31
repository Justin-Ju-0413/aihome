'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { vaultFetch, type VaultStatus } from './LockScreen';

const FILE_STATE_LABELS: Record<string, string> = {
  missing: '配置缺失',
  conflict: '冲突',
  unwritable: '不可写',
  locked: '锁定',
};

export function ToolStatusPanel({
  tools, providers, onChanged,
}: {
  tools: VaultStatus['tools'];
  providers: VaultStatus['providers'];
  onChanged: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pickerTool, setPickerTool] = useState<string | null>(null);

  const activate = async (tool: string, providerId: string) => {
    setBusyId(tool);
    setPickerTool(null);
    try {
      const res = await vaultFetch('/api/vault/activate', {
        method: 'POST',
        body: JSON.stringify({ tool, providerId }),
      });
      if (res.status === 409) {
        const body = (await res.json()) as { conflictDetail?: string };
        toast.error(`冲突：${body.conflictDetail ?? '配置被手动修改'}`);
      } else if (res.status === 423) {
        toast.error('会话已锁定');
      } else if (!res.ok) {
        toast.error('激活失败');
      } else {
        toast.success('已切换');
        onChanged();
      }
    } catch {
      toast.error('网络错误');
    } finally {
      setBusyId(null);
    }
  };

  const deactivate = async (tool: string) => {
    setBusyId(tool);
    try {
      const res = await vaultFetch('/api/vault/deactivate', {
        method: 'POST',
        body: JSON.stringify({ tool }),
      });
      if (res.status === 409) {
        const body = (await res.json()) as { conflictDetail?: string };
        toast.error(`冲突：${body.conflictDetail ?? '配置被手动修改'}`);
      } else if (!res.ok) {
        toast.error('还原失败');
      } else {
        toast.success('已还原默认');
        onChanged();
      }
    } catch {
      toast.error('网络错误');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="space-y-3">
      <h2 className="font-heading text-lg font-bold text-primary">工具状态</h2>
      {tools.map((tool) => (
        <div key={tool.id} data-testid="vault-tool-row" className="rounded-xl border border-divider bg-white/90 p-4">
          <div className="flex items-center gap-3">
            <span className="font-medium text-primary">{tool.label}</span>
            {tool.activeProviderName && (
              <span className="rounded-full bg-primary/10 text-primary text-xs px-2 py-0.5">{tool.activeProviderName}</span>
            )}
            <span className="rounded-full bg-secondary/10 text-secondary text-xs px-2 py-0.5">
              {FILE_STATE_LABELS[tool.fileState] ?? tool.fileState}
            </span>
            <div className="ml-auto flex gap-2">
              {providers.length > 0 && (
                <button
                  data-testid="vault-activate-btn"
                  onClick={() => setPickerTool(tool.id)}
                  disabled={busyId === tool.id}
                  className="rounded-lg bg-primary text-white px-3 py-1 text-xs font-medium disabled:opacity-40"
                >
                  切换
                </button>
              )}
              <button
                data-testid="vault-deactivate-btn"
                onClick={() => deactivate(tool.id)}
                disabled={busyId === tool.id || !tool.activeProviderId}
                className="rounded-lg border border-divider px-3 py-1 text-xs font-medium disabled:opacity-40"
              >
                还原
              </button>
            </div>
          </div>
          {tool.conflictDetail && (
            <p className="mt-2 text-xs text-red-600">⚠ {tool.conflictDetail}</p>
          )}
          {tool.stale && (
            <p className="mt-2 text-xs text-amber-600">⚠ 配置已过期，请重新切换</p>
          )}
          {pickerTool === tool.id && (
            <div className="mt-3 rounded-lg bg-secondary/5 border border-divider p-3 space-y-2">
              <p className="text-xs text-secondary">选择要激活的 provider：</p>
              {providers.map((p) => (
                <button
                  key={p.id}
                  data-testid={`activate-provider-${p.id}`}
                  onClick={() => activate(tool.id, p.id)}
                  className="block w-full text-left rounded-lg border border-divider bg-white px-3 py-2 text-sm hover:bg-primary/5"
                >
                  {p.name}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </section>
  );
}