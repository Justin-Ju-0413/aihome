'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import useSWR from 'swr';
import { LockScreen, vaultFetch, type VaultStatus } from '@/components/vault/LockScreen';
import { ProviderList } from '@/components/vault/ProviderList';
import { ToolStatusPanel } from '@/components/vault/ToolStatusPanel';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function VaultPage() {
  const { data, mutate } = useSWR<VaultStatus>('/api/vault/status', fetcher, { refreshInterval: 30_000 });
  const [pwBusy, setPwBusy] = useState(false);

  const lock = async () => {
    try {
      await vaultFetch('/api/vault/lock', { method: 'POST' });
      await mutate();
    } catch {
      toast.error('网络错误');
    }
  };

  const changePassword = async (oldPassword: string, newPassword: string) => {
    setPwBusy(true);
    try {
      const res = await vaultFetch('/api/vault/change-password', {
        method: 'POST',
        body: JSON.stringify({ oldPassword, newPassword }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        toast.error(body.error ?? '修改失败');
        return false;
      }
      toast.success('密码已修改');
      return true;
    } catch {
      toast.error('网络错误');
      return false;
    } finally {
      setPwBusy(false);
    }
  };

  if (!data) {
    return <div className="py-24 text-center text-secondary text-sm">加载中…</div>;
  }

  if (data.locked) {
    return <LockScreen firstTime={data.firstTime} onUnlocked={() => mutate()} />;
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-10">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-bold text-primary">API 管理</h1>
        <div className="flex gap-2">
          <PasswordDialog busy={pwBusy} onSubmit={changePassword} />
          <button
            data-testid="vault-lock-btn"
            onClick={lock}
            className="rounded-lg border border-divider px-3 py-1.5 text-sm font-medium"
          >
            锁定
          </button>
        </div>
      </div>
      <ToolStatusPanel tools={data.tools} providers={data.providers} onChanged={() => mutate()} />
      <ProviderList providers={data.providers} onChanged={() => mutate()} />
    </div>
  );
}

function PasswordDialog({ busy, onSubmit }: { busy: boolean; onSubmit: (oldPw: string, newPw: string) => Promise<boolean> }) {
  const [open, setOpen] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const submit = async () => {
    const ok = await onSubmit(oldPassword, newPassword);
    if (ok) {
      setOpen(false);
      setOldPassword('');
      setNewPassword('');
    }
  };

  if (!open) {
    return (
      <button
        data-testid="vault-change-password"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-divider px-3 py-1.5 text-sm font-medium"
      >
        改密码
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-divider bg-white/90 p-4 w-72 space-y-3 shadow-sm">
      <input
        type="password" value={oldPassword}
        onChange={(e) => setOldPassword(e.target.value)}
        placeholder="旧密码"
        className="w-full rounded-lg border border-divider px-3 py-2 text-sm"
      />
      <input
        type="password" value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
        placeholder="新密码（至少 8 位）"
        className="w-full rounded-lg border border-divider px-3 py-2 text-sm"
      />
      <div className="flex gap-2">
        <button
          onClick={submit} disabled={busy || newPassword.length < 8}
          className="rounded-lg bg-primary text-white px-3 py-1 text-xs font-medium disabled:opacity-40"
        >
          确认
        </button>
        <button onClick={() => setOpen(false)} className="rounded-lg border border-divider px-3 py-1 text-xs">取消</button>
      </div>
    </div>
  );
}