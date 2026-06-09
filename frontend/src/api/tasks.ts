import apiClient from './client';
import type { AsyncTask, PaginatedData, PaginationParams } from '@/types/api';

export const tasksApi = {
  list: (params?: PaginationParams & { taskType?: string; status?: string }) =>
    apiClient.get<PaginatedData<AsyncTask>>('/tasks', { params }),
  getById: (id: string) =>
    apiClient.get<AsyncTask>(`/tasks/${id}`),
  cancel: (id: string) =>
    apiClient.post(`/tasks/${id}/cancel`),
};
