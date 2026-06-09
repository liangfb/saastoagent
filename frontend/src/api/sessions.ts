import apiClient from './client';
import type { Session, Message, PaginatedData, PaginationParams } from '@/types/api';

export interface SendMessageResponse {
  content: string;
  toolCalls: unknown[];
  traceId: string;
}

export const sessionsApi = {
  list: (params?: PaginationParams) =>
    apiClient.get<PaginatedData<Session>>('/sessions', { params }),
  getById: (id: string) =>
    apiClient.get<Session & { messages: Message[] }>(`/sessions/${id}`),
  create: (data: { agentId?: string; title?: string }) =>
    apiClient.post<Session>('/sessions', data),
  delete: (id: string) =>
    apiClient.delete(`/sessions/${id}`),
  sendMessage: (sessionId: string, data: { content: string }) =>
    apiClient.post<SendMessageResponse>(`/sessions/${sessionId}/messages`, data),
  /**
   * Absolute URL for the SSE stream endpoint. EventSource is opened directly
   * (not through axios) so it receives the raw text/event-stream response.
   */
  streamUrl: (sessionId: string) => {
    const base = import.meta.env.VITE_API_BASE_URL || '/api/v1';
    return `${base}/sessions/${sessionId}/stream`;
  },
};
