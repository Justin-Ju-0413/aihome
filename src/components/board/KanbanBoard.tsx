'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  DndContext,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates, arrayMove } from '@dnd-kit/sortable';
import { useAppStore } from '@/stores/app-store';
import { KanbanColumn } from './KanbanColumn';
import type { AgentNode, AgentGroup } from '@/lib/types';
import { toast } from 'sonner';

interface KanbanBoardProps {
  onAddAgent: () => void;
  onSelectAgent: (agent: AgentNode) => void;
}

export function KanbanBoard({ onAddAgent, onSelectAgent }: KanbanBoardProps) {
  const { agents, groups } = useAppStore();
  const [items, setItems] = useState<Record<string, AgentNode[]>>({});

  // Initialize items from store
  useEffect(() => {
    const grouped: Record<string, AgentNode[]> = {};
    groups.forEach(g => { grouped[g.id] = []; });
    grouped['default'] = grouped['default'] || [];
    
    agents.forEach(agent => {
      const groupId = agent.group || 'default';
      if (!grouped[groupId]) grouped[groupId] = [];
      grouped[groupId].push(agent);
    });
    
    setItems(grouped);
  }, [agents, groups]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    const agentId = active.id as string;
    const overId = over.id as string;

    // Find source and destination groups
    let sourceGroupId: string | null = null;
    let destGroupId: string | null = null;
    let sourceIndex = -1;
    let destIndex = -1;

    for (const [groupId, groupAgents] of Object.entries(items)) {
      const idx = groupAgents.findIndex(a => a.id === agentId);
      if (idx !== -1) {
        sourceGroupId = groupId;
        sourceIndex = idx;
      }
      
      // Check if dropping on another agent
      const overIdx = groupAgents.findIndex(a => a.id === overId);
      if (overIdx !== -1) {
        destGroupId = groupId;
        destIndex = overIdx;
      }
      
      // Check if dropping on column
      if (groupId === overId) {
        destGroupId = groupId;
        destIndex = groupAgents.length;
      }
    }

    if (!sourceGroupId || !destGroupId) return;

    setItems(prev => {
      const newItems = { ...prev };
      
      if (sourceGroupId === destGroupId) {
        // Same column reorder
        newItems[sourceGroupId] = arrayMove(
          newItems[sourceGroupId],
          sourceIndex,
          destIndex
        );
      } else {
        // Cross-column move
        const [movedAgent] = newItems[sourceGroupId].splice(sourceIndex, 1);
        movedAgent.group = destGroupId;
        newItems[destGroupId] = newItems[destGroupId] || [];
        newItems[destGroupId].splice(destIndex, 0, movedAgent);
      }

      // Persist layout
      saveLayout(newItems);
      
      return newItems;
    });
  }, [items]);

  const saveLayout = async (groupedAgents: Record<string, AgentNode[]>) => {
    const layout: Record<string, { x: number; y: number; group: string }> = {};
    Object.entries(groupedAgents).forEach(([groupId, groupAgents]) => {
      groupAgents.forEach((agent, index) => {
        layout[agent.id] = { x: index, y: index, group: groupId };
      });
    });
    
    try {
      await fetch('/api/files', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: process.cwd() + '/.aihome/layout.json',
          content: JSON.stringify(layout, null, 2)
        })
      });
    } catch (error) {
      console.error('Failed to save layout:', error);
    }
  };

  const handleAddAgent = (groupId: string) => {
    onAddAgent();
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-6 p-6 overflow-x-auto h-full justify-center">
        {groups.map((group) => (
          <KanbanColumn
            key={group.id}
            group={group}
            agents={items[group.id] || []}
            onAddAgent={handleAddAgent}
            onSelectAgent={onSelectAgent}
          />
        ))}
      </div>
    </DndContext>
  );
}
