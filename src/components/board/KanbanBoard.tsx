'use client';

import { useMemo, useCallback } from 'react';
import {
  DndContext,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates, arrayMove } from '@dnd-kit/sortable';
import { useAppStore } from '@/stores/app-store';
import { KanbanColumn } from './KanbanColumn';
import type { AgentNode, AgentGroup } from '@/lib/types';

interface KanbanBoardProps {
  onAddAgent: () => void;
  onSelectAgent: (agent: AgentNode) => void;
}

function groupAgents(
  agents: AgentNode[],
  groups: AgentGroup[]
): Record<string, AgentNode[]> {
  const grouped: Record<string, AgentNode[]> = {};
  groups.forEach(g => { grouped[g.id] = []; });
  grouped['default'] = grouped['default'] || [];

  agents.forEach(agent => {
    const groupId = agent.group || 'default';
    if (!grouped[groupId]) grouped[groupId] = [];
    grouped[groupId].push(agent);
  });

  return grouped;
}

export function KanbanBoard({ onAddAgent, onSelectAgent }: KanbanBoardProps) {
  const { agents, groups, setAgents } = useAppStore();

  // Board layout is derived from the store so drag updates flow back through it.
  const items = useMemo(() => groupAgents(agents, groups), [agents, groups]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const saveLayout = useCallback(async (groupedAgents: Record<string, AgentNode[]>) => {
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
  }, []);

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

    const dragged = agents.find(a => a.id === agentId);
    if (!dragged) return;

    let newAgents: AgentNode[];
    if (sourceGroupId === destGroupId) {
      // Same column reorder: replace that group's subsequence in the flat array.
      const reorderedSlice = arrayMove(items[sourceGroupId], sourceIndex, destIndex);
      let ri = 0;
      newAgents = agents.map(a =>
        (a.group || 'default') === sourceGroupId ? reorderedSlice[ri++] ?? a : a
      );
    } else {
      // Cross-column move: drop the agent at the destination position with its new group.
      const withoutDragged = agents.filter(a => a.id !== agentId);
      const movedAgent: AgentNode = { ...dragged, group: destGroupId };
      const overAgent = withoutDragged.find(a => a.id === overId);
      const insertIndex = overAgent
        ? withoutDragged.indexOf(overAgent)
        : withoutDragged.length;
      newAgents = [
        ...withoutDragged.slice(0, insertIndex),
        movedAgent,
        ...withoutDragged.slice(insertIndex),
      ];
    }

    setAgents(newAgents);
    await saveLayout(groupAgents(newAgents, groups));
  }, [items, agents, groups, setAgents, saveLayout]);

  const handleAddAgent = () => {
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
