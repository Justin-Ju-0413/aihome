'use client';

type Skill = {
  id: string;
  name: string;
  description: string;
  platforms: { name: string; enabled: boolean; status: string }[];
};

export function SkillRow({ skill }: { skill: Skill }) {
  async function handleDelete() {
    if (!window.confirm(`删除 ${skill.name}？将移除其在所有启用平台上的链接（不删除平台目录内容）。`)) return;
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
              {p.name}: {p.status === 'none' ? '未同步' : p.status}
            </span>
          ))}
        </div>
      </div>
      <button onClick={handleDelete} className="text-sm text-red-500" data-testid={`delete-${skill.id}`}>
        删除
      </button>
    </li>
  );
}
