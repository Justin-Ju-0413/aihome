'use client';

import { useState, useEffect } from 'react';
import { X, Bot, Sparkles, FileText, FolderOpen, Trash2, Edit } from 'lucide-react';
import type { AgentNode } from '@/lib/types';
import { format } from 'date-fns';
import { useI18n } from '@/lib/i18n';

interface CardDetailProps {
  agent: AgentNode | null;
  onClose: () => void;
  onEdit: (agent: AgentNode) => void;
  onDelete: (agent: AgentNode) => void;
}

export function CardDetail({ agent, onClose, onEdit, onDelete }: CardDetailProps) {
  const { t } = useI18n();
  const [content, setContent] = useState<string>('');

  useEffect(() => {
    if (agent) {
      fetch(`/api/files?path=${encodeURIComponent(agent.filePath)}`)
        .then(res => res.json())
        .then(data => setContent(data.content || ''))
        .catch(err => console.error('Failed to load content:', err));
    }
  }, [agent]);

  if (!agent) return null;

  const typeIcon = agent.type === 'skill' ? <Sparkles className="w-5 h-5" /> : <Bot className="w-5 h-5" />;
  const typeColor = agent.type === 'skill' 
    ? 'bg-secondary/20 text-primary' 
    : 'bg-primary/10 text-primary';

  return (
    <div data-testid="card-detail-modal" className="fixed inset-0 scrim flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div 
        className="glass-panel rounded-xl border border-card-border shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-divider">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${typeColor}`}>
                {typeIcon}
              </div>
              <div>
                <h2 className="font-heading text-xl font-bold text-heading">{agent.name}</h2>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${typeColor}`}>
                    {agent.type}
                  </span>
                  <span className="text-xs text-muted">•</span>
                  <span className="text-xs text-muted">{agent.status}</span>
                </div>
              </div>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-primary/10 rounded-lg" aria-label={t('common.close')}>
              <X className="w-5 h-5 text-muted" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[50vh]">
          {/* Description */}
          <div className="mb-6">
            <h3 className="text-sm font-medium text-muted mb-2">{t('common.description')}</h3>
            <p className="text-text-body">{agent.description || t('board.agent.noDescriptionProvided')}</p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-primary/5 rounded-lg p-4 border border-card-border">
              <div className="flex items-center gap-2 text-muted mb-1">
                <FileText className="w-4 h-4" />
                <span className="text-sm">{t('board.detail.associatedFiles')}</span>
              </div>
              <p className="text-2xl font-bold text-heading">{agent.associatedFiles.total}</p>
              <div className="text-xs text-muted mt-1">
                {agent.associatedFiles.scripts > 0 && <span>{t('board.detail.scriptsCount', { count: agent.associatedFiles.scripts })}</span>}
                {agent.associatedFiles.references > 0 && <span>{t('board.detail.refsCount', { count: agent.associatedFiles.references })}</span>}
                {agent.associatedFiles.assets > 0 && <span>{t('board.detail.assetsCount', { count: agent.associatedFiles.assets })}</span>}
              </div>
            </div>
            <div className="bg-primary/5 rounded-lg p-4 border border-card-border">
              <div className="flex items-center gap-2 text-muted mb-1">
                <FolderOpen className="w-4 h-4" />
                <span className="text-sm">{t('board.detail.directory')}</span>
              </div>
              <p className="text-sm font-mono text-text-body truncate">{agent.dirPath.split('/').pop()}</p>
              <p className="text-xs text-muted mt-1 truncate">{agent.dirPath}</p>
            </div>
          </div>

          {/* Metadata */}
          {agent.metadata && Object.keys(agent.metadata).length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-medium text-muted mb-2">{t('board.detail.metadata')}</h3>
              <div className="bg-primary/5 rounded-lg p-4 space-y-2 border border-card-border">
                {Object.entries(agent.metadata).map(([key, value]) => (
                  <div key={key} className="flex justify-between text-sm">
                    <span className="text-muted">{key}</span>
                    <span className="text-text-body">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Content Preview */}
          <div className="mb-6">
            <h3 className="text-sm font-medium text-muted mb-2">{t('board.detail.contentPreview')}</h3>
            <pre className="bg-[#F8FAFD] border border-[#D6E2F0] text-primary rounded-lg p-4 text-xs overflow-x-auto max-h-48 font-mono">
              {content.slice(0, 1000)}{content.length > 1000 ? '\n...' : ''}
            </pre>
          </div>

          {/* File Info */}
          <div className="text-xs text-muted space-y-1">
            <p>{t('board.detail.file', { path: agent.filePath })}</p>
            <p>{t('board.detail.created', { date: format(new Date(agent.createdAt), 'PPP pp') })}</p>
            <p>{t('board.detail.updated', { date: format(new Date(agent.updatedAt), 'PPP pp') })}</p>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-6 border-t border-divider flex justify-end gap-3">
          <button
            onClick={() => onDelete(agent)}
            className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg flex items-center gap-2"
          >
            <Trash2 className="w-4 h-4" />
            {t('common.delete')}
          </button>
          <button
            onClick={() => onEdit(agent)}
            className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 flex items-center gap-2"
          >
            <Edit className="w-4 h-4" />
            {t('common.edit')}
          </button>
        </div>
      </div>
    </div>
  );
}
