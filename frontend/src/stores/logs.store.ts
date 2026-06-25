import { create } from 'zustand';
import type { LogEntry, Trace } from '@/types/api';
import { logsApi, tracesApi, type LogQueryParams } from '@/api/observability';
import { getErrorMessage, itemsOf } from '@/lib/utils';

interface LogsState {
  logs: LogEntry[];
  traces: Trace[];
  loading: boolean;
  error: string | null;
  fetchLogs: (params?: LogQueryParams) => Promise<void>;
  appendLog: (log: LogEntry) => void;
  fetchTraces: () => Promise<void>;
}

export const useLogsStore = create<LogsState>((set) => ({
  logs: [],
  traces: [],
  loading: false,
  error: null,
  fetchLogs: async (params) => {
    set({ loading: true, error: null });
    try {
      const data = await logsApi.list(params);
      set({ logs: itemsOf<LogEntry>(data), loading: false });
    } catch (err) {
      set({ error: getErrorMessage(err), loading: false });
    }
  },
  appendLog: (log) =>
    set((state) => ({
      logs: [log, ...state.logs.filter((item) => item.id !== log.id)].slice(0, 100),
    })),
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
