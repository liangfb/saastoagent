import apiClient from './client';
import type { LlmConfig, LlmModelAssignment, PaginatedData, PaginationParams } from '@/types/api';

export const llmConfigsApi = {
  list: (params?: PaginationParams) =>
    apiClient.get<PaginatedData<LlmConfig>>('/llm-configs', { params }),
  create: (data: Partial<LlmConfig>) =>
    apiClient.post<LlmConfig>('/llm-configs', data),
  update: (id: string, data: Partial<LlmConfig>) =>
    apiClient.put<LlmConfig>(`/llm-configs/${id}`, data),
  delete: (id: string) =>
    apiClient.delete(`/llm-configs/${id}`),
  test: (id: string) =>
    apiClient.post(`/llm-configs/${id}/test`),
};

export const llmAssignmentsApi = {
  get: () =>
    apiClient.get<LlmModelAssignment[]>('/llm-assignments'),
  update: (data: unknown) =>
    apiClient.put('/llm-assignments', data),
};
