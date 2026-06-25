import apiClient from './client';
import type { LogEntry, Trace, PaginatedData, PaginationParams } from '@/types/api';

export interface LogQueryParams extends PaginationParams {
  action?: string;
  resourceType?: string;
  resourceId?: string;
  traceId?: string;
  userId?: string;
  status?: string;
  toolName?: string;
  riskLevel?: string;
  from?: string;
  to?: string;
}

export const logsApi = {
  list: (params?: LogQueryParams) =>
    apiClient.get<PaginatedData<LogEntry>>('/logs', { params }),
  streamUrl: () => {
    const base = import.meta.env.VITE_API_BASE_URL || '/api/v1';
    return `${base}/logs/stream`;
  },
};

export const tracesApi = {
  list: (params?: PaginationParams) =>
    apiClient.get<PaginatedData<Trace>>('/traces', { params }),
  getById: (id: string) =>
    apiClient.get<Trace>(`/traces/${id}`),
  annotate: (id: string, data: { score: string; comment?: string }) =>
    apiClient.post(`/traces/${id}/annotate`, data),
};
