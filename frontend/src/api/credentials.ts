import apiClient from './client';
import type { Credential, PaginatedData, PaginationParams } from '@/types/api';

export const credentialsApi = {
  list: (params?: PaginationParams) =>
    apiClient.get<PaginatedData<Credential>>('/credentials', { params }),
  getById: (id: string) =>
    apiClient.get<Credential>(`/credentials/${id}`),
  reveal: (id: string) =>
    apiClient.get<Credential>(`/credentials/${id}/reveal`),
  create: (data: Partial<Credential>) =>
    apiClient.post<Credential>('/credentials', data),
  update: (id: string, data: Partial<Credential>) =>
    apiClient.put<Credential>(`/credentials/${id}`, data),
  delete: (id: string) =>
    apiClient.delete(`/credentials/${id}`),
  test: (id: string) =>
    apiClient.post(`/credentials/${id}/test`),
};
