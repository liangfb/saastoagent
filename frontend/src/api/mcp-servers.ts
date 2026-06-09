import apiClient from './client';
import type { McpServer, PaginatedData, PaginationParams } from '@/types/api';

export interface McpTool {
  id: string;
  mcpServerId: string;
  endpointId: string | null;
  toolName: string;
  toolDescription: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown> | null;
  createdAt: string;
}

export const mcpServersApi = {
  list: (params?: PaginationParams & { openapiSourceId?: string }) =>
    apiClient.get<PaginatedData<McpServer>>('/mcp-servers', { params }),
  getById: (id: string) => apiClient.get<McpServer>(`/mcp-servers/${id}`),
  getTools: (id: string) => apiClient.get<McpTool[]>(`/mcp-servers/${id}/tools`),
  start: (id: string) => apiClient.post(`/mcp-servers/${id}/start`),
  stop: (id: string) => apiClient.post(`/mcp-servers/${id}/stop`),
  getLogs: (id: string) => apiClient.get<{ logs: string }>(`/mcp-servers/${id}/logs`),
};
