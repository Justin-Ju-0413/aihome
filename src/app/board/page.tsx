'use client';

import { useState, useEffect, useCallback } from 'react';
import { Search, Plus, RefreshCw } from 'lucide-react';
import { KanbanBoard } from '@/components/board/KanbanBoard';
import { CardDetail } from '@/components/board/CardDetail';
import { useAppStore } from '@/stores/app-store';
import type { AgentNode } from '@/lib/types';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n';

export default function BoardPage() {
  const { t } = useI18n();
  const {
    agents, groups, setAgents, setLayout,
    searchQuery, setSearchQuery, filterType, setFilterType,
    setIsScanning, isScanning
  } = useAppStore();

  const [selectedAgent, setSelectedAgent] = useState<AgentNode | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const loadAgents = useCallback(async () => {
    try {
      setIsScanning(true);
      const [agentsRes, layoutRes] = await Promise.all([
        fetch('/api/agents'),
        fetch('/api/workspace/layout'),
      ]);
      const agentsData = await agentsRes.json();
      const layoutData = layoutRes.ok ? await layoutRes.json() : {};
      setAgents(agentsData);
      setLayout(layoutData);
    } catch {
      toast.error(t('board.page.loadFailed'));
    } finally {
      setIsScanning(false);
    }
  }, [setAgents, setLayout, setIsScanning, t]);

  // Load agents on mount
  useEffect(() => {
    loadAgents();
  }, [loadAgents]);

  const handleRescan = async () => {
    try {
      setIsScanning(true);
      const res = await fetch('/api/scan', { method: 'POST' });
      const data = await res.json();
      setAgents(data.agents);
      toast.success(t('board.page.scanFound', { count: data.agents.length }));
    } catch {
      toast.error(t('board.page.scanFailed'));
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <header className="px-6 py-8 text-center">
        <h1 className="font-heading text-3xl font-bold text-heading">{t('board.page.title')}</h1>
        <div className="w-16 h-px bg-divider mx-auto mt-3" />
        <p className="text-sm text-muted mt-2">
          {t('board.page.summary', { count: agents.length, groups: groups.length })}
        </p>

        {/* Controls */}
        <div className="flex items-center justify-center gap-3 mt-6">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
            <input
              type="text"
              placeholder={t('board.search.placeholder')}
              data-testid="board-search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-4 py-2 border border-card-border rounded-lg w-64 glass-input focus:outline-none focus:ring-2 focus:ring-accent text-text-body placeholder:text-muted"
            />
          </div>

          {/* Filter */}
          <select
            data-testid="board-filter"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as 'all' | 'agent' | 'skill')}
            className="px-3 py-2 border border-card-border rounded-lg glass-input focus:outline-none focus:ring-2 focus:ring-accent text-text-body"
          >
            <option value="all">{t('board.filter.allTypes')}</option>
            <option value="agent">{t('board.filter.agents')}</option>
            <option value="skill">{t('board.filter.skills')}</option>
          </select>

          {/* Actions */}
          <button
            onClick={handleRescan}
            disabled={isScanning}
            className="p-2 hover:bg-primary/10 rounded-lg disabled:opacity-50 text-text-body"
            title={t('board.page.rescan')}
          >
            <RefreshCw className={`w-5 h-5 ${isScanning ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={() => setShowCreateModal(true)}
            data-testid="board-new-agent-btn"
            className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            {t('board.page.newAgent')}
          </button>
        </div>
      </header>

      {/* Board */}
      <div className="flex-1 overflow-auto">
        <KanbanBoard
          onAddAgent={() => setShowCreateModal(true)}
          onSelectAgent={setSelectedAgent}
        />
      </div>

      {/* Card Detail Modal */}
      {selectedAgent && (
        <CardDetail
          agent={selectedAgent}
          onClose={() => setSelectedAgent(null)}
          onEdit={(agent) => {
            setSelectedAgent(null);
            window.location.href = `/agents/${agent.id}`;
          }}
          onDelete={async (agent) => {
            if (window.confirm(t('board.card.confirmDelete', { name: agent.name }))) {
              try {
                await fetch(`/api/agents/${agent.id}`, { method: 'DELETE' });
                setAgents(agents.filter(a => a.id !== agent.id));
                setSelectedAgent(null);
                toast.success(t('board.card.deleted'));
              } catch {
                toast.error(t('board.card.deleteFailed'));
              }
            }
          }}
        />
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <CreateAgentModal
          onClose={() => setShowCreateModal(false)}
          onCreated={() => {
            setShowCreateModal(false);
            loadAgents();
          }}
        />
      )}
    </div>
  );
}

function CreateAgentModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { t } = useI18n();
  const [type, setType] = useState<'agent' | 'skill'>('skill');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) return;

    setIsCreating(true);
    try {
      const res = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, name, description })
      });

      if (res.ok) {
        toast.success(t('board.create.created'));
        onCreated();
      } else {
        toast.error(t('board.create.createFailed'));
      }
    } catch {
      toast.error(t('board.create.createFailed'));
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 scrim flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="glass-panel rounded-xl border border-card-border shadow-xl max-w-md w-full" onClick={(e) => e.stopPropagation()}>
        <div className="p-6">
          <h2 className="font-heading text-xl font-bold text-heading mb-4">{t('board.create.title')}</h2>

          <div className="space-y-4">
            {/* Type Selection */}
            <div>
              <label className="block text-sm font-medium text-text-body mb-2">{t('board.create.type')}</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setType('agent')}
                  className={`p-4 border-2 rounded-lg text-left transition-colors ${
                    type === 'agent' ? 'border-primary bg-primary/10' : 'border-card-border hover:border-secondary'
                  }`}
                >
                  <div className="font-medium text-heading">{t('board.create.agent')}</div>
                  <div className="text-sm text-muted">{t('board.create.formatAgents')}</div>
                </button>
                <button
                  onClick={() => setType('skill')}
                  className={`p-4 border-2 rounded-lg text-left transition-colors ${
                    type === 'skill' ? 'border-primary bg-primary/10' : 'border-card-border hover:border-secondary'
                  }`}
                >
                  <div className="font-medium text-heading">{t('board.create.skill')}</div>
                  <div className="text-sm text-muted">{t('board.create.formatSkill')}</div>
                </button>
              </div>
            </div>

            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-text-body mb-2">{t('common.name')}</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('board.create.namePlaceholder')}
                className="w-full px-4 py-2 border border-card-border rounded-lg glass-input focus:outline-none focus:ring-2 focus:ring-accent text-text-body placeholder:text-muted"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-text-body mb-2">{t('common.description')}</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('board.create.descPlaceholder')}
                rows={3}
                className="w-full px-4 py-2 border border-card-border rounded-lg glass-input focus:outline-none focus:ring-2 focus:ring-accent text-text-body placeholder:text-muted"
              />
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-divider flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-text-body hover:bg-primary/10 rounded-lg"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleCreate}
            disabled={isCreating || !name.trim()}
            className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50"
          >
            {isCreating ? t('common.saving') : t('common.create')}
          </button>
        </div>
      </div>
    </div>
  );
}
