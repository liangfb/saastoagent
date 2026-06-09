import apiClient from './client';
import type { LogEntry, Trace, PaginatedData, PaginationParams } from '@/types/api';

export const logsApi = {
  list: (params?: PaginationParams & { level?: string; service?: string }) =>
    apiClient.get<PaginatedData<LogEntry>>('/logs', { params }),
};

export const tracesApi = {
  list: (params?: PaginationParams) =>
    apiClient.get<PaginatedData<Trace>>('/traces', { params }),
  getById: (id: string) =>
    apiClient.get<Trace>(`/traces/${id}`),
  annotate: (id: string, data: { score: string; comment?: string }) =>
    apiClient.post(`/traces/${id}/annotate`, data),
};
