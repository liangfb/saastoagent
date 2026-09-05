import apiClient from './client';
import type { PaginatedData, PaginationParams, Policy, PolicyRule } from '@/types/api';

export interface PolicyPayload {
  name: string;
  description?: string | null;
  enabled: boolean;
  priority: number;
  scope: Record<string, unknown>;
  rules: PolicyRule[];
}

export const policiesApi = {
  list: (params?: PaginationParams) => apiClient.get<PaginatedData<Policy>>('/policies', { params }),
  create: (data: PolicyPayload) => apiClient.post<Policy>('/policies', data),
  update: (id: string, data: Partial<PolicyPayload>) => apiClient.put<Policy>(`/policies/${id}`, data),
  delete: (id: string) => apiClient.delete(`/policies/${id}`),
};
