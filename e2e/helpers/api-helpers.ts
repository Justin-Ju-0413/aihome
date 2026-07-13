import { type APIRequestContext } from '@playwright/test';

export class ApiHelper {
  constructor(private request: APIRequestContext) {}

  async getAgents() {
    const res = await this.request.get('/api/agents');
    return res.json();
  }

  async createAgent(type: 'agent' | 'skill', name: string, description = '') {
    const res = await this.request.post('/api/agents', {
      data: { type, name, description },
    });
    return res.json();
  }

  async deleteAgent(id: string) {
    await this.request.delete(`/api/agents/${id}`);
  }

  async getAgent(id: string) {
    const res = await this.request.get(`/api/agents/${id}`);
    return res.json();
  }

  async updateAgent(id: string, data: Record<string, unknown>) {
    const res = await this.request.put(`/api/agents/${id}`, { data });
    return res.json();
  }

  async getWorkspaceConfig() {
    const res = await this.request.get('/api/workspace');
    return res.json();
  }

  async updateWorkspaceConfig(config: Record<string, unknown>) {
    const res = await this.request.put('/api/workspace', { data: config });
    return res.json();
  }

  async scan(paths?: string[]) {
    const res = await this.request.post('/api/scan', {
      data: paths ? { paths } : {},
    });
    return res.json();
  }

  async getRelations() {
    const res = await this.request.get('/api/relations');
    return res.json();
  }

  async updateRelations(relations: unknown[]) {
    const res = await this.request.put('/api/relations', { data: relations });
    return res.json();
  }

  async readFile(path: string) {
    const res = await this.request.get(`/api/files?path=${encodeURIComponent(path)}`);
    return res.json();
  }

  async writeFile(path: string, content: string) {
    const res = await this.request.put('/api/files', { data: { path, content } });
    return res.json();
  }
}
