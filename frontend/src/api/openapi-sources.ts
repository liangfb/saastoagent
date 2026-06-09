import apiClient from './client';
import type { OpenapiSource, Endpoint, PaginatedData, PaginationParams } from '@/types/api';

export interface SpecPreview {
  contentType: string;
  specVersion: string | null;
  title: string | null;
  description: string | null;
  pathCount: number | null;
  raw: string;
  parsed: unknown;
}

export const openapiSourcesApi = {
  list: (params?: PaginationParams) =>
    apiClient.get<PaginatedData<OpenapiSource>>('/openapi-sources', { params }),
  getById: (id: string) =>
    apiClient.get<OpenapiSource & { rawSpec?: unknown }>(`/openapi-sources/${id}`),
  create: (data: Partial<OpenapiSource>) =>
    apiClient.post<OpenapiSource>('/openapi-sources', data),
  update: (id: string, data: Partial<OpenapiSource>) =>
    apiClient.put<OpenapiSource>(`/openapi-sources/${id}`, data),
  delete: (id: string) =>
    apiClient.delete(`/openapi-sources/${id}`),
  preview: (sourceUrl: string) =>
    apiClient.post<SpecPreview>('/openapi-sources/preview', { sourceUrl }),
  parse: (id: string) =>
    apiClient.post(`/openapi-sources/${id}/parse`),
  regenerate: (id: string) =>
    apiClient.post(`/openapi-sources/${id}/regenerate`),
  getEndpoints: (id: string, params?: PaginationParams) =>
    apiClient.get<PaginatedData<Endpoint>>(`/openapi-sources/${id}/endpoints`, { params }),
  enhance: (id: string) =>
    apiClient.post(`/openapi-sources/${id}/enhance`),
  generateMcp: (id: string) =>
    apiClient.post(`/openapi-sources/${id}/generate-mcp`),
};
