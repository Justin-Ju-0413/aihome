'use client';

import { RegistryPanel } from '@/components/registry/RegistryPanel';
import { useI18n } from '@/lib/i18n';

export default function SkillsPage() {
  const { t } = useI18n();
  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="mb-2 text-xl font-semibold">{t('skills.title')}</h1>
      <p className="mb-4 text-sm text-gray-500">
        {t('skills.description')}
      </p>
      <RegistryPanel />
    </main>
  );
}
