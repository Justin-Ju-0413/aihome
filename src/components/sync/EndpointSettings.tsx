'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { Plus, Trash2, Save } from 'lucide-react';

export function EndpointSettings() {
  const [endpoints, setEndpoints] = useState<Record<string, string>>({});
  const [newName, setNewName] = useState('');
  const [newPath, setNewPath] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/sync/endpoints');
      const data = await res.json();
      if (res.ok) setEndpoints(data.endpoints);
      else toast.error(data.error ?? 'Failed to load sync endpoints');
    } catch {
      toast.error('Failed to load sync endpoints');
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch endpoints on mount
    load();
  }, [load]);

  const handleSave = async () => {
    try {
      const res = await fetch('/api/sync/endpoints', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoints }),
      });
      const data = await res.json();
      if (res.ok) {
        setEndpoints(data.endpoints);
        toast.success('Sync endpoints saved');
      } else {
        toast.error(data.error ?? 'Failed to save');
      }
    } catch {
      toast.error('Failed to save');
    }
  };

  const handleAdd = () => {
    if (!newName.trim() || !newPath.trim()) return;
    setEndpoints({ ...endpoints, [newName.trim()]: newPath.trim() });
    setNewName('');
    setNewPath('');
  };

  const handleRemove = (name: string) => {
    const next = { ...endpoints };
    delete next[name];
    setEndpoints(next);
  };

  return (
    <section className="mb-8">
      <h2 className="font-heading text-xl font-semibold mb-4">同步端点</h2>
      <div className="space-y-2 mb-4">
        {Object.entries(endpoints).map(([name, p]) => (
          <div key={name} className="flex items-center gap-2">
            <span className="w-32 font-medium">{name}</span>
            <input
              value={p}
              onChange={(e) => setEndpoints({ ...endpoints, [name]: e.target.value })}
              className="flex-1 px-3 py-2 border border-divider rounded-lg text-sm"
            />
            <button onClick={() => handleRemove(name)} className="text-red-500 hover:text-red-700" aria-label={`删除 ${name}`}>
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 mb-4">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="端名（如 opencode）"
          className="w-40 px-3 py-2 border border-divider rounded-lg text-sm"
        />
        <input
          value={newPath}
          onChange={(e) => setNewPath(e.target.value)}
          placeholder="端路径（如 ~/.claude/skills）"
          className="flex-1 px-3 py-2 border border-divider rounded-lg text-sm"
        />
        <button onClick={handleAdd} className="inline-flex items-center gap-1 px-3 py-2 text-sm border border-divider rounded-lg">
          <Plus size={16} /> 添加
        </button>
      </div>
      <button onClick={handleSave} className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg">
        <Save size={16} /> 保存端点
      </button>
    </section>
  );
}
