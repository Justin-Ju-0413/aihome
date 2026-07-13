'use client';

import { useState, useEffect, use, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Save, Trash2, FileText, FolderOpen } from 'lucide-react';
import { toast } from 'sonner';
import MDEditor from '@uiw/react-md-editor';
import type { AgentNode } from '@/lib/types';

export default function AgentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [agent, setAgent] = useState<AgentNode | null>(null);
  const [frontmatter, setFrontmatter] = useState<Record<string, unknown>>({});
  const [markdownBody, setMarkdownBody] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'edit' | 'files' | 'preview'>('edit');

  const loadAgent = useCallback(async () => {
    try {
      const res = await fetch(`/api/agents/${id}`);
      const data = await res.json();
      setAgent(data);

      if (data.parsed) {
        setFrontmatter(data.parsed.data || {});
        setMarkdownBody(data.parsed.content || '');
      } else {
        setMarkdownBody(data.content);
      }

      // Load file tree
      const treeRes = await fetch(`/api/files?path=${encodeURIComponent(data.dirPath)}`);
      if (treeRes.ok) {
        // Build file tree client-side would need a separate API
        // For now, just set empty
      }
    } catch {
      toast.error('Failed to load agent');
      router.push('/agents');
    }
  }, [id, router, setAgent, setFrontmatter, setMarkdownBody]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch agent detail on mount / id change
    loadAgent();
  }, [loadAgent]);

  const handleSave = async () => {
    if (!agent) return;
    setIsSaving(true);

    try {
      const isSkill = agent.filePath.endsWith('SKILL.md');
      const body = isSkill
        ? { frontmatter, body: markdownBody }
        : { content: markdownBody };

      const res = await fetch(`/api/agents/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (res.ok) {
        toast.success('Saved successfully');
      } else {
        toast.error('Failed to save');
      }
    } catch {
      toast.error('Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!agent || !confirm(`Delete "${agent.name}"? This cannot be undone.`)) return;

    try {
      await fetch(`/api/agents/${id}`, { method: 'DELETE' });
      toast.success('Agent deleted');
      router.push('/agents');
    } catch {
      toast.error('Failed to delete');
    }
  };

  if (!agent) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-pulse text-muted">Loading...</div>
      </div>
    );
  }

  const typeColor = agent.type === 'skill'
    ? 'bg-secondary/20 text-primary'
    : 'bg-primary/10 text-primary';

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-divider px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => router.back()} className="p-2 hover:bg-primary/10 rounded-lg">
              <ArrowLeft className="w-5 h-5 text-text-body" />
            </button>
            <div>
              <h1 className="font-heading text-xl font-bold text-heading">{agent.name}</h1>
              <div className="flex items-center gap-2 mt-1">
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${typeColor}`}>
                  {agent.type}
                </span>
                <span className="text-xs text-muted">•</span>
                <span className="text-xs text-muted font-mono">{agent.filePath.split('/').slice(-2).join('/')}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleDelete}
              data-testid="agent-detail-delete-btn"
              className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              data-testid="agent-detail-save-btn"
              className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 flex items-center gap-2 disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {isSaving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-4">
          {['edit', 'files', 'preview'].map(tab => (
            <button
              key={tab}
              data-testid={`tab-${tab}`}
              onClick={() => setActiveTab(tab as 'edit' | 'files' | 'preview')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === tab ? 'bg-primary/10 text-primary' : 'text-muted hover:bg-primary/5'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {activeTab === 'edit' && (
          <div className="p-6 space-y-6">
            {/* Frontmatter Editor (for SKILL.md) */}
            {agent.type === 'skill' && Object.keys(frontmatter).length > 0 && (
              <div className="bg-white rounded-lg border border-card-border p-6">
                <h2 className="font-heading text-lg font-semibold text-heading mb-4">Metadata (Frontmatter)</h2>
                <div className="grid grid-cols-2 gap-4">
                  {Object.entries(frontmatter).map(([key, value]) => (
                    <div key={key}>
                      <label className="block text-sm font-medium text-text-body mb-1">{key}</label>
                      {typeof value === 'string' ? (
                        <input
                          type="text"
                          value={value}
                          onChange={(e) => setFrontmatter({ ...frontmatter, [key]: e.target.value })}
                          className="w-full px-3 py-2 border border-card-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-accent text-text-body"
                        />
                      ) : (
                        <textarea
                          value={JSON.stringify(value, null, 2)}
                          onChange={(e) => {
                            try {
                              setFrontmatter({ ...frontmatter, [key]: JSON.parse(e.target.value) });
                            } catch {}
                          }}
                          rows={3}
                          className="w-full px-3 py-2 border border-card-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-accent font-mono text-sm text-text-body"
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Markdown Editor */}
            <div className="bg-white rounded-lg border border-card-border overflow-hidden">
              <div className="px-4 py-3 border-b border-card-border bg-primary/5">
                <h2 className="text-sm font-medium text-text-body">Content</h2>
              </div>
              <div data-color-mode="light">
                <MDEditor
                  value={markdownBody}
                  onChange={(val) => setMarkdownBody(val || '')}
                  height={500}
                  preview="live"
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'files' && (
          <div className="p-6">
            <div className="bg-white rounded-lg border border-card-border p-6">
              <h2 className="font-heading text-lg font-semibold text-heading mb-4 flex items-center gap-2">
                <FolderOpen className="w-5 h-5" />
                Files in {agent.dirPath.split('/').pop()}
              </h2>
              <div className="space-y-2">
                <FileRow name="AGENTS.md" isMain />
                {agent.type === 'skill' && <FileRow name="SKILL.md" isMain />}
              </div>
              <div className="mt-4 text-sm text-muted space-y-1">
                <p>Directory: {agent.dirPath}</p>
                <p>Associated files: {agent.associatedFiles.total}</p>
                {agent.associatedFiles.scripts > 0 && <p>Scripts: {agent.associatedFiles.scripts}</p>}
                {agent.associatedFiles.references > 0 && <p>References: {agent.associatedFiles.references}</p>}
                {agent.associatedFiles.assets > 0 && <p>Assets: {agent.associatedFiles.assets}</p>}
                {agent.associatedFiles.rules > 0 && <p>Rules: {agent.associatedFiles.rules}</p>}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'preview' && (
          <div className="p-6">
            <div className="bg-white rounded-lg border border-card-border p-6">
              <div data-color-mode="light" className="prose max-w-none">
                <MDEditor.Markdown source={markdownBody} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function FileRow({ name, isMain }: { name: string; isMain?: boolean }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2 hover:bg-primary/5 rounded-lg">
      <FileText className={`w-4 h-4 ${isMain ? 'text-primary' : 'text-muted'}`} />
      <span className="text-sm text-text-body">{name}</span>
      {isMain && <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">Main</span>}
    </div>
  );
}
