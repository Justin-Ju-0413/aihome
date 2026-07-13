import { create } from 'zustand';
import type { AgentNode, AgentGroup, AgentRelation } from '@/lib/types';
import type { AgentLayout } from '@/lib/workspace-config';

interface AppState {
  // Data
  agents: AgentNode[];
  groups: AgentGroup[];
  relations: AgentRelation[];
  layout: AgentLayout;
  
  // UI State
  selectedAgentId: string | null;
  viewMode: 'board' | 'graph' | 'list';
  searchQuery: string;
  filterType: 'all' | 'agent' | 'skill';
  
  // Loading states
  isLoading: boolean;
  isScanning: boolean;
  
  // Actions
  setAgents: (agents: AgentNode[]) => void;
  setGroups: (groups: AgentGroup[]) => void;
  setRelations: (relations: AgentRelation[]) => void;
  setLayout: (layout: AgentLayout) => void;
  setSelectedAgentId: (id: string | null) => void;
  setViewMode: (mode: 'board' | 'graph' | 'list') => void;
  setSearchQuery: (query: string) => void;
  setFilterType: (type: 'all' | 'agent' | 'skill') => void;
  setIsLoading: (loading: boolean) => void;
  setIsScanning: (scanning: boolean) => void;
  
  // Computed
  getFilteredAgents: () => AgentNode[];
}

export const useAppStore = create<AppState>((set, get) => ({
  // Initial state
  agents: [],
  groups: [
    { id: 'default', name: 'Default', color: '#6366f1', description: 'Default group' },
    { id: 'agents', name: 'Agents', color: '#10b981', description: 'Agent definitions' },
    { id: 'skills', name: 'Skills', color: '#f59e0b', description: 'Skill definitions' }
  ],
  relations: [],
  layout: {},
  selectedAgentId: null,
  viewMode: 'board',
  searchQuery: '',
  filterType: 'all',
  isLoading: false,
  isScanning: false,

  // Actions
  setAgents: (agents) => set({ agents }),
  setGroups: (groups) => set({ groups }),
  setRelations: (relations) => set({ relations }),
  setLayout: (layout) => set({ layout }),
  setSelectedAgentId: (id) => set({ selectedAgentId: id }),
  setViewMode: (mode) => set({ viewMode: mode }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setFilterType: (type) => set({ filterType: type }),
  setIsLoading: (loading) => set({ isLoading: loading }),
  setIsScanning: (scanning) => set({ isScanning: scanning }),

  // Computed
  getFilteredAgents: () => {
    const { agents, searchQuery, filterType } = get();
    return agents.filter(agent => {
      const matchesSearch = !searchQuery || 
        agent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        agent.description.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesType = filterType === 'all' || agent.type === filterType;
      return matchesSearch && matchesType;
    });
  }
}));
