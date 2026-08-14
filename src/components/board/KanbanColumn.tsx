'use client';

import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Plus } from 'lucide-react';
import type { AgentNode, AgentGroup } from '@/lib/types';
import { AgentCard } from './AgentCard';

interface KanbanColumnProps {
  group: AgentGroup;
  agents: AgentNode[];
  onAddAgent: (groupId: string) => void;
  onSelectAgent: (agent: AgentNode) => void;
}

export function KanbanColumn({ group, agents, onAddAgent, onSelectAgent }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: group.id });

  return (
    <div className="flex flex-col w-80 flex-shrink-0">
      {/* Column Header */}
      <div className="flex items-center justify-between mb-3 px-2">
        <div className="flex items-center gap-2">
          <div 
            className="w-3 h-3 rounded-full" 
            style={{ backgroundColor: group.color }} 
          />
          <h2 className="font-heading font-semibold text-heading">{group.name}</h2>
          <span className="text-sm text-muted bg-primary/10 px-2 py-0.5 rounded-full">
            {agents.length}
          </span>
        </div>
      </div>

      {/* Cards Container */}
      <div
        ref={setNodeRef}
        className={`flex-1 glass-panel rounded-lg p-3 space-y-3 min-h-[200px] transition-colors border border-card-border ${
          isOver ? 'bg-primary/5 ring-2 ring-accent/30' : ''
        }`}
      >
        <SortableContext items={agents.map(a => a.id)} strategy={verticalListSortingStrategy}>
          {agents.map((agent) => (
            <AgentCard 
              key={agent.id} 
              agent={agent} 
              onSelect={onSelectAgent}
            />
          ))}
        </SortableContext>

        {/* Add Button */}
        <button
          onClick={() => onAddAgent(group.id)}
          className="w-full py-3 border-2 border-dashed border-card-border rounded-lg text-muted hover:text-primary hover:border-primary transition-colors flex items-center justify-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Add Agent
        </button>
      </div>
    </div>
  );
}
