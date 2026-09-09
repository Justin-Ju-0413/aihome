'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Plus, RefreshCw } from 'lucide-react';
import { KanbanBoard } from '@/components/board/KanbanBoard';
import { CardDetail } from '@/components/board/CardDetail';
import { useAppStore } from '@/stores/app-store';
import type { AgentNode } from '@/lib/types';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input, Textarea, FieldLabel } from '@/components/ui/Input';

export default function BoardPage() {
  const { t } = useI18n();
  const router = useRouter();
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
      <PageHeader
        title={t('board.page.title')}
        subtitle={t('board.page.summary', { count: agents.length, groups: groups.length })}
        actions={
          <>
            {/* Search */}
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <Input
                type="text"
                placeholder={t('board.search.placeholder')}
                data-testid="board-search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-64 pl-9"
              />
            </div>

            {/* Filter */}
            <select
              data-testid="board-filter"
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as 'all' | 'agent' | 'skill')}
              className="rounded-lg border border-card-border glass-input px-3 py-2 text-sm text-text-body focus:outline-none focus:ring-2 focus:ring-accent"
            >
              <option value="all">{t('board.filter.allTypes')}</option>
              <option value="agent">{t('board.filter.agents')}</option>
              <option value="skill">{t('board.filter.skills')}</option>
            </select>

            {/* Actions */}
            <Button
              onClick={handleRescan}
              disabled={isScanning}
              variant="ghost"
              className="!px-2"
              title={t('board.page.rescan')}
            >
              <RefreshCw className={`h-5 w-5 ${isScanning ? 'animate-spin' : ''}`} />
            </Button>

            <Button
              onClick={() => setShowCreateModal(true)}
              data-testid="board-new-agent-btn"
            >
              <Plus className="h-4 w-4" />
              {t('board.page.newAgent')}
            </Button>
          </>
        }
      />

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
            router.push(`/agents/${agent.id}`);
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

  const typeOption = (value: 'agent' | 'skill', label: string, format: string) => (
    <button
      type="button"
      onClick={() => setType(value)}
      className={`p-4 border-2 rounded-lg text-left transition-colors ${
        type === value ? 'border-primary bg-primary/10' : 'border-card-border hover:border-secondary'
      }`}
    >
      <div className="font-medium text-heading">{label}</div>
      <div className="text-sm text-muted">{format}</div>
    </button>
  );

  return (
    <Modal
      open
      onClose={onClose}
      title={t('board.create.title')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button onClick={handleCreate} disabled={isCreating || !name.trim()}>
            {isCreating ? t('common.saving') : t('common.create')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Type Selection */}
        <div>
          <FieldLabel>{t('board.create.type')}</FieldLabel>
          <div className="grid grid-cols-2 gap-3">
            {typeOption('agent', t('board.create.agent'), t('board.create.formatAgents'))}
            {typeOption('skill', t('board.create.skill'), t('board.create.formatSkill'))}
          </div>
        </div>

        {/* Name */}
        <div>
          <FieldLabel>{t('common.name')}</FieldLabel>
          <Input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('board.create.namePlaceholder')}
            className="w-full"
          />
        </div>

        {/* Description */}
        <div>
          <FieldLabel>{t('common.description')}</FieldLabel>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('board.create.descPlaceholder')}
            rows={3}
            className="w-full"
          />
        </div>
      </div>
    </Modal>
  );
}
