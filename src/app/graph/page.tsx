'use client';

import dynamic from 'next/dynamic';
import { Info } from 'lucide-react';

const AgentGraph = dynamic(() => import('@/components/graph/AgentGraph'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full">
      <div className="text-muted">Loading graph...</div>
    </div>
  ),
});

export default function GraphPage() {
  return (
    <div className="h-full flex flex-col">
      <header className="px-6 py-8 text-center">
        <h1 className="font-heading text-3xl font-bold text-heading">Agent Graph</h1>
        <div className="w-16 h-px bg-divider mx-auto mt-3" />
        <p className="text-sm text-muted mt-2">Visualize agent relationships and dependencies</p>

        {/* Info & Legend */}
        <div className="flex items-center justify-center gap-4 mt-6 flex-wrap">
          <div className="flex items-center gap-2 text-xs text-muted bg-white/60 border border-card-border px-3 py-2 rounded-lg">
            <Info className="w-4 h-4" />
            <span>Drag between nodes to create connections</span>
          </div>

          <div className="mx-2 w-px h-4 bg-divider" />

          <div className="flex items-center gap-2 text-xs text-muted">
            <div className="w-8 h-0.5 bg-primary" />
            <span>Calls</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted">
            <div className="w-8 h-0.5" style={{ borderTop: '1.5px dashed #f59e0b' }} />
            <span>Depends</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted">
            <div className="w-8 h-0.5 bg-emerald-500" />
            <span>Extends</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted">
            <div className="w-8 h-0.5" style={{ borderTop: '1px dotted #8b5cf6' }} />
            <span>References</span>
          </div>

          <div className="mx-2 w-px h-4 bg-divider" />

          <div className="flex items-center gap-2 text-xs text-muted">
            <div className="w-3 h-3 rounded border-2 border-primary bg-primary/5" />
            <span>Agent</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted">
            <div className="w-3 h-3 rounded border-2 border-secondary bg-secondary/5" />
            <span>Skill</span>
          </div>
        </div>
      </header>

      <div className="flex-1">
        <AgentGraph />
      </div>
    </div>
  );
}
