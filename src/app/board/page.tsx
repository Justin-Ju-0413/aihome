'use client';

import { useState, useEffect } from 'react';
import { Search, Plus, RefreshCw } from 'lucide-react';
import { KanbanBoard } from '@/components/board/KanbanBoard';
import { CardDetail } from '@/components/board/CardDetail';
import { useAppStore } from '@/stores/app-store';
import type { AgentNode } from '@/lib/types';
import { toast } from 'sonner';

export default function BoardPage() {
  const { 
    agents, groups, setAgents, setGroups, 
    searchQuery, setSearchQuery, filterType, setFilterType,
    setIsScanning, isScanning 
  } = useAppStore();
  
  const [selectedAgent, setSelectedAgent] = useState<AgentNode | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Load agents on mount
  useEffect(() => {
    loadAgents();
  }, []);

  const loadAgents = async () => {
    try {
      setIsScanning(true);
      const res = await fetch('/api/agents');
      const data = await res.json();
      setAgents(data);
    } catch (error) {
      toast.error('Failed to load agents');
    } finally {
      setIsScanning(false);
    }
  };

  const handleRescan = async () => {
    try {
      setIsScanning(true);
      const res = await fetch('/api/scan', { method: 'POST' });
      const data = await res.json();
      setAgents(data.agents);
      toast.success(`Found ${data.agents.length} agents`);
    } catch (error) {
      toast.error('Scan failed');
    } finally {
      setIsScanning(false);
    }
  };

  const filteredAgents = agents.filter(agent => {
    const matchesSearch = !searchQuery || 
      agent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      agent.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = filterType === 'all' || agent.type === filterType;
    return matchesSearch && matchesType;
  });

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <header className="px-6 py-8 text-center">
        <h1 className="font-heading text-3xl font-bold text-heading">Agent Board</h1>
        <div className="w-16 h-px bg-divider mx-auto mt-3" />
        <p className="text-sm text-muted mt-2">
          {agents.length} agents in {groups.length} groups
        </p>

        {/* Controls */}
        <div className="flex items-center justify-center gap-3 mt-6">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
            <input
              type="text"
              placeholder="Search agents..."
              data-testid="board-search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-4 py-2 border border-card-border rounded-lg w-64 bg-white/80 focus:outline-none focus:ring-2 focus:ring-accent text-text-body placeholder:text-muted"
            />
          </div>

          {/* Filter */}
          <select
            data-testid="board-filter"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as 'all' | 'agent' | 'skill')}
            className="px-3 py-2 border border-card-border rounded-lg bg-white/80 focus:outline-none focus:ring-2 focus:ring-accent text-text-body"
          >
            <option value="all">All Types</option>
            <option value="agent">Agents</option>
            <option value="skill">Skills</option>
          </select>

          {/* Actions */}
          <button
            onClick={handleRescan}
            disabled={isScanning}
            className="p-2 hover:bg-primary/10 rounded-lg disabled:opacity-50 text-text-body"
            title="Rescan"
          >
            <RefreshCw className={`w-5 h-5 ${isScanning ? 'animate-spin' : ''}`} />
          </button>
          
          <button
            onClick={() => setShowCreateModal(true)}
            data-testid="board-new-agent-btn"
            className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            New Agent
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
            if (confirm(`Delete "${agent.name}"? This cannot be undone.`)) {
              try {
                await fetch(`/api/agents/${agent.id}`, { method: 'DELETE' });
                setAgents(agents.filter(a => a.id !== agent.id));
                setSelectedAgent(null);
                toast.success('Agent deleted');
              } catch (error) {
                toast.error('Failed to delete agent');
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
        toast.success('Agent created');
        onCreated();
      } else {
        toast.error('Failed to create agent');
      }
    } catch (error) {
      toast.error('Failed to create agent');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl border border-card-border shadow-xl max-w-md w-full" onClick={(e) => e.stopPropagation()}>
        <div className="p-6">
          <h2 className="font-heading text-xl font-bold text-heading mb-4">Create New Agent</h2>
          
          <div className="space-y-4">
            {/* Type Selection */}
            <div>
              <label className="block text-sm font-medium text-text-body mb-2">Type</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setType('agent')}
                  className={`p-4 border-2 rounded-lg text-left transition-colors ${
                    type === 'agent' ? 'border-primary bg-primary/10' : 'border-card-border hover:border-secondary'
                  }`}
                >
                  <div className="font-medium text-heading">Agent</div>
                  <div className="text-sm text-muted">AGENTS.md format</div>
                </button>
                <button
                  onClick={() => setType('skill')}
                  className={`p-4 border-2 rounded-lg text-left transition-colors ${
                    type === 'skill' ? 'border-primary bg-primary/10' : 'border-card-border hover:border-secondary'
                  }`}
                >
                  <div className="font-medium text-heading">Skill</div>
                  <div className="text-sm text-muted">SKILL.md format</div>
                </button>
              </div>
            </div>

            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-text-body mb-2">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., code-assistant"
                className="w-full px-4 py-2 border border-card-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-accent text-text-body placeholder:text-muted"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-text-body mb-2">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What does this agent do?"
                rows={3}
                className="w-full px-4 py-2 border border-card-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-accent text-text-body placeholder:text-muted"
              />
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-divider flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-text-body hover:bg-primary/10 rounded-lg"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={isCreating || !name.trim()}
            className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50"
          >
            {isCreating ? 'Creating...' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}
