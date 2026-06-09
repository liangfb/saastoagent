import { create } from 'zustand';
import type { LogEntry, Trace } from '@/types/api';
import { logsApi, tracesApi } from '@/api/observability';
import { getErrorMessage, itemsOf } from '@/lib/utils';

interface LogsState {
  logs: LogEntry[];
  traces: Trace[];
  loading: boolean;
  error: string | null;
  fetchLogs: () => Promise<void>;
  fetchTraces: () => Promise<void>;
}

export const useLogsStore = create<LogsState>((set) => ({
  logs: [],
  traces: [],
  loading: false,
  error: null,
  fetchLogs: async () => {
    set({ loading: true, error: null });
    try {
      const data = await logsApi.list();
      set({ logs: itemsOf<LogEntry>(data), loading: false });
    } catch (err) {
      set({ error: getErrorMessage(err), loading: false });
    }
  },
  fetchTraces: async () => {
    set({ loading: true, error: null });
    try {
      const data = await tracesApi.list();
      set({ traces: itemsOf<Trace>(data), loading: false });
    } catch (err) {
      set({ error: getErrorMessage(err), loading: false });
    }
  },
}));
