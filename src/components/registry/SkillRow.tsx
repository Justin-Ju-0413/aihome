'use client';

import { useI18n } from '@/lib/i18n';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';

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
    <li
      className={cn(
        'glass-panel rounded-xl border border-card-border p-4 flex items-center justify-between gap-4',
      )}
    >
      <div>
        <div className="font-medium text-heading">{skill.name}</div>
        <div className="text-sm text-muted">{skill.description}</div>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {skill.platforms.map((p) => (
            <Badge
              key={p.name}
              data-testid={`badge-${p.name}-${skill.id}`}
              tone={p.status === 'linked' ? 'success' : p.status === 'conflict' ? 'warning' : 'neutral'}
            >
              {p.name}: {p.status === 'none' ? t('registry.notSynced') : p.status}
            </Badge>
          ))}
        </div>
      </div>
      <button
        onClick={handleDelete}
        className="shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium text-red-600 dark:text-red-400 transition-colors hover:bg-red-500/10"
        data-testid={`delete-${skill.id}`}
      >
        {t('common.delete')}
      </button>
    </li>
  );
}
