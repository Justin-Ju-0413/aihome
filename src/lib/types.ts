// Core type definitions for AI Agent management system

export interface AgentNode {
  id: string;
  name: string;
  type: 'agent' | 'skill';
  description: string;
  filePath: string;
  dirPath: string;
  status: 'active' | 'draft' | 'archived';
  
  // SKILL.md specific fields
  license?: string;
  compatibility?: string;
  allowedTools?: string[];
  metadata?: Record<string, string>;
  
  // Scan statistics
  associatedFiles: {
    scripts: number;
    references: number;
    assets: number;
    rules: number;
    total: number;
  };
  
  // Relations
  dependencies: string[];
  calledBy: string[];
  
  // Kanban layout
  group: string;
  position: { x: number; y: number };
  
  // Timestamps
  createdAt: string;
  updatedAt: string;
}

export interface AgentGroup {
  id: string;
  name: string;
  color: string;
  description: string;
}

export interface AgentRelation {
  id: string;
  source: string;
  target: string;
  type: 'calls' | 'depends' | 'extends' | 'references';
  label?: string;
}

export interface WorkspaceConfig {
  name: string;
  paths: string[];
  groups: AgentGroup[];
  layout: Record<string, { x: number; y: number }>;
}

export interface ScanResult {
  agents: AgentNode[];
  errors: string[];
  scannedPaths: string[];
  timestamp: string;
}

export interface FileTreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileTreeNode[];
  size?: number;
}
