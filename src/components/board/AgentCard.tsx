'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Bot, Sparkles, FileText, FolderOpen, MoreVertical } from 'lucide-react';
import { useState } from 'react';
import type { AgentNode } from '@/lib/types';
import { cn } from '@/lib/utils';

interface AgentCardProps {
  agent: AgentNode;
  onSelect: (agent: AgentNode) => void;
}

export function AgentCard({ agent, onSelect }: AgentCardProps) {
  const [showMenu, setShowMenu] = useState(false);
  
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: agent.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const typeIcon = agent.type === 'skill' ? <Sparkles className="w-4 h-4" /> : <Bot className="w-4 h-4" />;
  const typeColor = agent.type === 'skill' 
    ? 'bg-secondary/20 text-primary' 
    : 'bg-primary/10 text-primary';

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        'bg-white rounded-lg border border-card-border p-4 cursor-grab active:cursor-grabbing',
        'hover:shadow-md transition-shadow',
        isDragging && 'opacity-50 shadow-lg'
      )}
      onClick={(e) => {
        if (!isDragging) {
          e.stopPropagation();
          onSelect(agent);
        }
      }}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium flex items-center gap-1', typeColor)}>
            {typeIcon}
            {agent.type}
          </span>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowMenu(!showMenu);
          }}
          className="p-1 hover:bg-primary/10 rounded"
        >
          <MoreVertical className="w-4 h-4 text-muted" />
        </button>
      </div>

      {/* Title */}
      <h3 className="font-heading font-semibold text-heading mb-1 line-clamp-1">
        {agent.name}
      </h3>

      {/* Description */}
      <p className="text-sm text-text-body line-clamp-2 mb-3">
        {agent.description || 'No description'}
      </p>

      {/* Footer */}
      <div className="flex items-center gap-3 text-xs text-muted">
        {agent.associatedFiles.total > 0 && (
          <span className="flex items-center gap-1">
            <FileText className="w-3 h-3" />
            {agent.associatedFiles.total} files
          </span>
        )}
        <span className="flex items-center gap-1">
          <FolderOpen className="w-3 h-3" />
          {agent.dirPath.split('/').pop()}
        </span>
      </div>

      {/* Status indicator */}
      <div className="absolute top-2 right-2">
        <div className={cn(
          'w-2 h-2 rounded-full',
          agent.status === 'active' ? 'bg-green-400' :
          agent.status === 'draft' ? 'bg-yellow-400' : 'bg-gray-400'
        )} />
      </div>
    </div>
  );
}
