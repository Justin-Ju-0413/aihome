'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { KeyRound } from 'lucide-react';
import useSWR from 'swr';
import { LockScreen, vaultFetch, type VaultStatus } from '@/components/vault/LockScreen';
import { ProviderList } from '@/components/vault/ProviderList';
import { ToolStatusPanel } from '@/components/vault/ToolStatusPanel';
import { useI18n } from '@/lib/i18n';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input, FieldLabel } from '@/components/ui/Input';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function VaultPage() {
  const { t } = useI18n();
  const { data, mutate } = useSWR<VaultStatus>('/api/vault/status', fetcher, { refreshInterval: 30_000 });
  const [pwBusy, setPwBusy] = useState(false);

  const lock = async () => {
    try {
      await vaultFetch('/api/vault/lock', { method: 'POST' });
      await mutate();
    } catch {
      toast.error(t('vault.toast.network'));
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
        toast.error(body.error ?? t('vault.toast.changeFailed'));
        return false;
      }
      toast.success(t('vault.toast.passwordChanged'));
      return true;
    } catch {
      toast.error(t('vault.toast.network'));
      return false;
    } finally {
      setPwBusy(false);
    }
  };

  if (!data) {
    return <div className="py-24 text-center text-secondary text-sm">{t('common.loading')}</div>;
  }

  if (data.locked) {
    return <LockScreen firstTime={data.firstTime} onUnlocked={() => mutate()} />;
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-10">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-3xl font-bold text-heading flex items-center gap-3">
          <KeyRound className="w-6 h-6 text-primary" />
          {t('vault.title')}
        </h1>
        <div className="flex gap-2">
          <PasswordDialog busy={pwBusy} onSubmit={changePassword} />
          <Button data-testid="vault-lock-btn" onClick={lock} variant="secondary" size="sm">
            {t('vault.lock')}
          </Button>
        </div>
      </div>
      <ToolStatusPanel tools={data.tools} providers={data.providers} onChanged={() => mutate()} />
      <ProviderList providers={data.providers} onChanged={() => mutate()} />
    </div>
  );
}

function PasswordDialog({ busy, onSubmit }: { busy: boolean; onSubmit: (oldPw: string, newPw: string) => Promise<boolean> }) {
  const { t } = useI18n();
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

  const close = () => setOpen(false);

  return (
    <>
      <Button data-testid="vault-change-password" onClick={() => setOpen(true)} variant="secondary" size="sm">
        {t('vault.changePassword')}
      </Button>
      <Modal
        open={open}
        onClose={close}
        title={t('vault.changePassword')}
        maxWidth="max-w-sm"
        footer={
          <>
            <Button variant="ghost" onClick={close}>{t('common.cancel')}</Button>
            <Button onClick={submit} disabled={busy || newPassword.length < 8}>{t('common.confirm')}</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <FieldLabel>{t('vault.oldPassword')}</FieldLabel>
            <Input type="password" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} className="w-full" />
          </div>
          <div>
            <FieldLabel>{t('vault.newPassword')}</FieldLabel>
            <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="w-full" />
          </div>
        </div>
      </Modal>
    </>
  );
}
