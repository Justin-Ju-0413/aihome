'use client';

import { useMemo, useCallback } from 'react';
import { Bot } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
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
import type { AgentNode } from '@/lib/types';
import type { AgentLayout } from '@/lib/workspace-config';

interface KanbanBoardProps {
  onAddAgent: () => void;
  onSelectAgent: (agent: AgentNode) => void;
}

export function KanbanBoard({ onAddAgent, onSelectAgent }: KanbanBoardProps) {
  const { agents, groups, layout, setLayout } = useAppStore();
  const { t } = useI18n();

  // Board arrangement is driven by the persisted layout: each agent's column
  // comes from layout[id].group (falling back to agent.group), and each
  // column's order comes from layout[id].order.
  const items = useMemo(() => {
    const grouped: Record<string, AgentNode[]> = {};
    groups.forEach(g => { grouped[g.id] = []; });
    grouped['default'] = grouped['default'] || [];

    agents.forEach(agent => {
      const groupId = layout[agent.id]?.group ?? agent.group ?? 'default';
      if (!grouped[groupId]) grouped[groupId] = [];
      grouped[groupId].push(agent);
    });

    Object.keys(grouped).forEach(groupId => {
      grouped[groupId].sort(
        (a, b) =>
          (layout[a.id]?.order ?? Infinity) - (layout[b.id]?.order ?? Infinity)
      );
    });

    return grouped;
  }, [agents, groups, layout]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const persistLayout = useCallback(
    async (newLayout: AgentLayout) => {
      setLayout(newLayout);
      try {
        await fetch('/api/workspace/layout', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newLayout),
        });
      } catch (error) {
        console.error('Failed to save layout:', error);
      }
    },
    [setLayout]
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

      // Dropping on another agent
      const overIdx = groupAgents.findIndex(a => a.id === overId);
      if (overIdx !== -1) {
        destGroupId = groupId;
        destIndex = overIdx;
      }

      // Dropping on a column
      if (groupId === overId) {
        destGroupId = groupId;
        destIndex = groupAgents.length;
      }
    }

    if (!sourceGroupId || !destGroupId) return;

    const moved = items[sourceGroupId]?.[sourceIndex];
    if (!moved) return;

    const newItems: Record<string, AgentNode[]> = { ...items };

    if (sourceGroupId === destGroupId) {
      newItems[sourceGroupId] = arrayMove(items[sourceGroupId], sourceIndex, destIndex);
    } else {
      newItems[sourceGroupId] = items[sourceGroupId].filter((_, i) => i !== sourceIndex);
      const destAgents = [...items[destGroupId]];
      destAgents.splice(destIndex, 0, moved);
      newItems[destGroupId] = destAgents;
    }

    // Rebuild the full layout from the new arrangement and persist it.
    const newLayout: AgentLayout = {};
    Object.entries(newItems).forEach(([groupId, groupAgents]) => {
      groupAgents.forEach((a, idx) => {
        newLayout[a.id] = { group: groupId, order: idx };
      });
    });

    await persistLayout(newLayout);
  }, [items, persistLayout]);

  const handleAddAgent = () => {
    onAddAgent();
  };

  if (agents.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 p-10 text-center">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
          <Bot className="w-8 h-8 text-primary" />
        </div>
        <div>
          <h3 className="font-heading text-lg font-semibold text-heading">{t('board.empty.title')}</h3>
          <p className="text-sm text-muted mt-1 max-w-sm">{t('board.empty.subtitle')}</p>
        </div>
        <button
          onClick={onAddAgent}
          className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 text-sm font-medium"
        >
          {t('board.page.newAgent')}
        </button>
      </div>
    );
  }

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
