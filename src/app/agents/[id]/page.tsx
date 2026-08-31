'use client';

import { useState, useEffect, use, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Save, Trash2, FileText, FolderOpen } from 'lucide-react';
import { toast } from 'sonner';
import MDEditor from '@uiw/react-md-editor';
import type { AgentNode } from '@/lib/types';
import { useI18n } from '@/lib/i18n';

export default function AgentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { t } = useI18n();
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
      toast.error(t('agents.detail.loadFailed'));
      router.push('/agents');
    }
  }, [id, router, setAgent, setFrontmatter, setMarkdownBody, t]);

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
        toast.success(t('agents.detail.saved'));
      } else {
        toast.error(t('agents.detail.saveFailed'));
      }
    } catch {
      toast.error(t('agents.detail.saveFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!agent || !window.confirm(t('board.card.confirmDelete', { name: agent.name }))) return;

    try {
      await fetch(`/api/agents/${id}`, { method: 'DELETE' });
      toast.success(t('board.card.deleted'));
      router.push('/agents');
    } catch {
      toast.error(t('agents.detail.deleteFailed'));
    }
  };

  if (!agent) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-pulse text-muted">{t('common.loading')}</div>
      </div>
    );
  }

  const typeColor = agent.type === 'skill'
    ? 'bg-secondary/20 text-primary'
    : 'bg-primary/10 text-primary';

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <header className="glass-nav border-b border-divider px-6 py-4">
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
              {t('common.delete')}
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              data-testid="agent-detail-save-btn"
              className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 flex items-center gap-2 disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {isSaving ? t('common.saving') : t('common.save')}
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-4">
          {(['edit', 'files', 'preview'] as const).map(tab => (
            <button
              key={tab}
              data-testid={`tab-${tab}`}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === tab ? 'bg-primary/10 text-primary' : 'text-muted hover:bg-primary/5'
              }`}
            >
              {t(tabLabels[tab] as 'agents.detail.tabEdit' | 'agents.detail.tabFiles' | 'agents.detail.tabPreview')}
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
              <div className="glass-panel rounded-lg border border-card-border p-6">
                <h2 className="font-heading text-lg font-semibold text-heading mb-4">{t('agents.detail.metadataFrontmatter')}</h2>
                <div className="grid grid-cols-2 gap-4">
                  {Object.entries(frontmatter).map(([key, value]) => (
                    <div key={key}>
                      <label className="block text-sm font-medium text-text-body mb-1">{key}</label>
                      {typeof value === 'string' ? (
                        <input
                          type="text"
                          value={value}
                          onChange={(e) => setFrontmatter({ ...frontmatter, [key]: e.target.value })}
                          className="w-full px-3 py-2 border border-card-border rounded-lg glass-input focus:outline-none focus:ring-2 focus:ring-accent text-text-body"
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
                          className="w-full px-3 py-2 border border-card-border rounded-lg glass-input focus:outline-none focus:ring-2 focus:ring-accent font-mono text-sm text-text-body"
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Markdown Editor */}
            <div className="glass-panel rounded-lg border border-card-border overflow-hidden">
              <div className="px-4 py-3 border-b border-card-border bg-primary/5">
                <h2 className="text-sm font-medium text-text-body">{t('agents.detail.content')}</h2>
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
            <div className="glass-panel rounded-lg border border-card-border p-6">
              <h2 className="font-heading text-lg font-semibold text-heading mb-4 flex items-center gap-2">
                <FolderOpen className="w-5 h-5" />
                {t('agents.detail.filesIn', { name: agent.dirPath.split('/').pop() || '' })}
              </h2>
              <div className="space-y-2">
                <FileRow name="AGENTS.md" isMain />
                {agent.type === 'skill' && <FileRow name="SKILL.md" isMain />}
              </div>
              <div className="mt-4 text-sm text-muted space-y-1">
                <p>{t('agents.detail.directory', { path: agent.dirPath })}</p>
                <p>{t('agents.detail.associatedFiles', { count: agent.associatedFiles.total })}</p>
                {agent.associatedFiles.scripts > 0 && <p>{t('agents.detail.scriptsCount', { count: agent.associatedFiles.scripts })}</p>}
                {agent.associatedFiles.references > 0 && <p>{t('agents.detail.referencesCount', { count: agent.associatedFiles.references })}</p>}
                {agent.associatedFiles.assets > 0 && <p>{t('agents.detail.assetsCount', { count: agent.associatedFiles.assets })}</p>}
                {agent.associatedFiles.rules > 0 && <p>{t('agents.detail.rulesCount', { count: agent.associatedFiles.rules })}</p>}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'preview' && (
          <div className="p-6">
            <div className="glass-panel rounded-lg border border-card-border p-6">
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

const tabLabels: Record<'edit' | 'files' | 'preview', string> = {
  edit: 'agents.detail.tabEdit',
  files: 'agents.detail.tabFiles',
  preview: 'agents.detail.tabPreview',
};

function FileRow({ name, isMain }: { name: string; isMain?: boolean }) {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-3 px-3 py-2 hover:bg-primary/5 rounded-lg">
      <FileText className={`w-4 h-4 ${isMain ? 'text-primary' : 'text-muted'}`} />
      <span className="text-sm text-text-body">{name}</span>
      {isMain && <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">{t('agents.detail.main')}</span>}
    </div>
  );
}
