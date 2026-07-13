'use client';

import { useCallback, useEffect } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  Connection,
  Edge,
  Node,
  NodeProps,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';
import { useAppStore } from '@/stores/app-store';
import type { AgentNode, AgentRelation } from '@/lib/types';
import { toast } from 'sonner';

const nodeWidth = 250;
const nodeHeight = 100;

interface AgentNodeData extends Record<string, unknown> {
  label: string;
  type: 'agent' | 'skill';
  description: string;
  fileCount: number;
}

function getLayoutedElements(nodes: Node[], edges: Edge[], direction = 'TB') {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: direction, nodesep: 80, ranksep: 100 });

  nodes.forEach((node) => {
    g.setNode(node.id, { width: nodeWidth, height: nodeHeight });
  });

  edges.forEach((edge) => {
    g.setEdge(edge.source, edge.target);
  });

  dagre.layout(g);

  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = g.node(node.id);
    return {
      ...node,
      position: {
        x: nodeWithPosition.x - nodeWidth / 2,
        y: nodeWithPosition.y - nodeHeight / 2,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
}

function agentToNode(agent: AgentNode): Node<AgentNodeData> {
  return {
    id: agent.id,
    type: 'agentNode',
    position: { x: 0, y: 0 },
    data: {
      label: agent.name,
      type: agent.type,
      description: agent.description,
      fileCount: agent.associatedFiles.total,
    },
  };
}

function relationToEdge(relation: AgentRelation): Edge {
  const edgeStyles = {
    calls: { stroke: '#0A4F9D', strokeWidth: 2 },
    depends: { stroke: '#f59e0b', strokeWidth: 1.5, strokeDasharray: '5 5' },
    extends: { stroke: '#10b981', strokeWidth: 2 },
    references: { stroke: '#8b5cf6', strokeWidth: 1, strokeDasharray: '2 2' },
  };

  const style = edgeStyles[relation.type] || edgeStyles.calls;

  return {
    id: relation.id,
    source: relation.source,
    target: relation.target,
    label: relation.label || relation.type,
    markerEnd: { type: MarkerType.ArrowClosed, color: style.stroke },
    style,
    labelStyle: { fontSize: 11, fill: '#4A6FA5' },
    labelBgStyle: { fill: '#F8FAFD', fillOpacity: 0.9 },
    labelBgPadding: [6, 3] as [number, number],
  };
}

// Custom node component
function AgentNodeComponent({ data }: NodeProps<Node<AgentNodeData>>) {
  const typeColor = data.type === 'skill' ? 'border-secondary bg-secondary/5' : 'border-primary bg-primary/5';
  const typeBadge = data.type === 'skill' ? 'bg-secondary/20 text-primary' : 'bg-primary/10 text-primary';

  return (
    <div className={`px-4 py-3 rounded-lg border-2 ${typeColor} shadow-sm min-w-[200px]`}>
      <div className="flex items-center gap-2 mb-1">
        <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${typeBadge}`}>
          {data.type}
        </span>
      </div>
      <div className="font-heading font-semibold text-sm text-heading">{data.label}</div>
      {data.description && (
        <div className="text-xs text-text-body mt-1 line-clamp-2">{data.description}</div>
      )}
      {data.fileCount > 0 && (
        <div className="text-xs text-muted mt-1">{data.fileCount} files</div>
      )}
    </div>
  );
}

const nodeTypes = { agentNode: AgentNodeComponent };

export default function AgentGraphInner() {
  const { agents, relations, setAgents, setRelations } = useAppStore();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const loadAgents = useCallback(async () => {
    try {
      const res = await fetch('/api/agents');
      const data = await res.json();
      setAgents(data);
    } catch {
      toast.error('Failed to load agents');
    }
  }, [setAgents]);

  const loadRelations = useCallback(async () => {
    try {
      const res = await fetch('/api/relations');
      const data = await res.json();
      setRelations(data);
    } catch {
      console.error('Failed to load relations');
    }
  }, [setRelations]);

  useEffect(() => {
    loadAgents();
    loadRelations();
  }, [loadAgents, loadRelations]);

  useEffect(() => {
    if (agents.length > 0) {
      const flowNodes = agents.map(agentToNode);
      const flowEdges = relations.map(relationToEdge);
      const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(flowNodes, flowEdges);
      setNodes(layoutedNodes);
      setEdges(layoutedEdges);
    }
  }, [agents, relations, setNodes, setEdges]);

  const onConnect = useCallback(async (connection: Connection) => {
    const newRelation: AgentRelation = {
      id: `${connection.source}-${connection.target}`,
      source: connection.source!,
      target: connection.target!,
      type: 'calls',
      label: 'calls',
    };

    const updatedRelations = [...relations, newRelation];
    setRelations(updatedRelations);

    // Save to server
    try {
      await fetch('/api/relations', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedRelations)
      });
    } catch {
      toast.error('Failed to save relation');
    }

    setEdges((eds) => addEdge(relationToEdge(newRelation), eds));
  }, [relations, setRelations, setEdges]);

  return (
    <div className="w-full h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        fitView
        attributionPosition="bottom-left"
      >
        <Background color="#C5D8EE" gap={24} />
        <Controls />
        <MiniMap
          nodeColor={(n) => n.data?.type === 'skill' ? '#6B97C8' : '#0A4F9D'}
          maskColor="rgba(10,79,157,0.08)"
        />
      </ReactFlow>
    </div>
  );
}
