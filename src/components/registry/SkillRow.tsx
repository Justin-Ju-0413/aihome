'use client';

import { useI18n } from '@/lib/i18n';

type Skill = {
  id: string;
  name: string;
  description: string;
  platforms: { name: string; enabled: boolean; status: string }[];
};

export function SkillRow({ skill }: { skill: Skill }) {
  const { t } = useI18n();
  async function handleDelete() {
    if (!window.confirm(t('registry.deleteConfirm', { name: skill.name }))) return;
    await fetch(`/api/registry/skills/${skill.id}`, { method: 'DELETE' });
    window.location.reload();
  }

  return (
    <li className="flex items-center justify-between rounded border p-3">
      <div>
        <div className="font-medium">{skill.name}</div>
        <div className="text-sm text-gray-500">{skill.description}</div>
        <div className="mt-1 flex gap-2">
          {skill.platforms.map((p) => (
            <span
              key={p.name}
              data-testid={`badge-${p.name}-${skill.id}`}
              className={
                p.status === 'linked'
                  ? 'rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-700'
                  : p.status === 'conflict'
                    ? 'rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700'
                    : 'rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500'
              }
            >
              {p.name}: {p.status === 'none' ? t('registry.notSynced') : p.status}
            </span>
          ))}
        </div>
      </div>
      <button onClick={handleDelete} className="text-sm text-red-500" data-testid={`delete-${skill.id}`}>
        {t('common.delete')}
      </button>
    </li>
  );
}
