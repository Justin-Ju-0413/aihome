'use client';

import { RegistryPanel } from '@/components/registry/RegistryPanel';
import { useI18n } from '@/lib/i18n';
import { PageHeader } from '@/components/ui/PageHeader';

export default function SkillsPage() {
  const { t } = useI18n();
  return (
    <main className="mx-auto max-w-3xl px-6 pb-10">
      <PageHeader
        title={t('skills.title')}
        subtitle={t('skills.description')}
        align="left"
      />
      <RegistryPanel />
    </main>
  );
}
