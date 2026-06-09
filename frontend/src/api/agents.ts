import apiClient from './client';
import type { Agent, PaginatedData, PaginationParams } from '@/types/api';

export const agentsApi = {
  list: (params?: PaginationParams) =>
    apiClient.get<PaginatedData<Agent>>('/agents', { params }),
  getById: (id: string) =>
    apiClient.get<Agent>(`/agents/${id}`),
  create: (data: Partial<Agent>) =>
    apiClient.post<Agent>('/agents', data),
  update: (id: string, data: Partial<Agent>) =>
    apiClient.put<Agent>(`/agents/${id}`, data),
  delete: (id: string) =>
    apiClient.delete(`/agents/${id}`),
  bindMcp: (id: string, data: { mcpToolId: string }) =>
    apiClient.post(`/agents/${id}/mcp-bindings`, data),
  unbindMcp: (id: string, bindingId: string) =>
    apiClient.delete(`/agents/${id}/mcp-bindings/${bindingId}`),
  setMcpBindings: (id: string, mcpToolIds: string[]) =>
    apiClient.put(`/agents/${id}/mcp-bindings`, { mcpToolIds }),
};
