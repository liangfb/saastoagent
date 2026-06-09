import { create } from 'zustand';
import type { Session, Message } from '@/types/api';
import { sessionsApi } from '@/api/sessions';
import { getErrorMessage, itemsOf } from '@/lib/utils';

export interface TraceEvent {
  id: string;
  type:
    | 'thinking'
    | 'tool_call'
    | 'tool_result'
    | 'tool_error'
    | 'response'
    | 'done'
    | 'error';
  data: Record<string, unknown>;
  timestamp: number;
}

interface SessionsState {
  items: Session[];
  activeSessionId: string | null;
  messages: Message[];
  traceEvents: TraceEvent[];
  sending: boolean;
  loading: boolean;
  error: string | null;
  fetchItems: () => Promise<void>;
  createSession: (data: { title?: string; agentId?: string }) => Promise<Session>;
  deleteSession: (id: string) => Promise<void>;
  setActiveSession: (id: string | null) => void;
  loadMessages: (sessionId: string) => Promise<void>;
  sendMessage: (sessionId: string, content: string) => Promise<void>;
  appendTraceEvent: (event: Omit<TraceEvent, 'id' | 'timestamp'>) => void;
  clearTrace: () => void;
}

let eventId = 0;
const nextId = () => {
  eventId += 1;
  return `evt-${eventId}`;
};

export const useSessionsStore = create<SessionsState>((set, get) => ({
  items: [],
  activeSessionId: null,
  messages: [],
  traceEvents: [],
  sending: false,
  loading: false,
  error: null,
  fetchItems: async () => {
    set({ loading: true, error: null });
    try {
      const data = await sessionsApi.list();
      set({ items: itemsOf<Session>(data), loading: false });
    } catch (err) {
      set({ error: getErrorMessage(err), loading: false });
    }
  },
  createSession: async (data) => {
    const session = (await sessionsApi.create(data)) as unknown as Session;
    await get().fetchItems();
    return session;
  },
  deleteSession: async (id) => {
    await sessionsApi.delete(id);
    if (get().activeSessionId === id) {
      set({ activeSessionId: null, messages: [], traceEvents: [] });
    }
    await get().fetchItems();
  },
  setActiveSession: (id) =>
    set({ activeSessionId: id, messages: [], traceEvents: [] }),
  loadMessages: async (sessionId) => {
    try {
      const data = (await sessionsApi.getById(sessionId)) as unknown as {
        messages?: Message[];
      };
      set({
        messages: data?.messages ?? [],
        activeSessionId: sessionId,
        traceEvents: [],
      });
    } catch (err) {
      set({ error: getErrorMessage(err) });
    }
  },
  sendMessage: async (sessionId, content) => {
    const userMsg: Message = {
      id: `local-${Date.now()}`,
      sessionId,
      role: 'user',
      content,
      metadata: null,
      createdAt: new Date().toISOString(),
    };
    set((s) => ({
      messages: [...s.messages, userMsg],
      traceEvents: [],
      sending: true,
      error: null,
    }));
    try {
      const res = (await sessionsApi.sendMessage(sessionId, { content })) as unknown as {
        content: string;
        toolCalls: unknown[];
        traceId: string;
      };
      const assistantMsg: Message = {
        id: `local-asst-${Date.now()}`,
        sessionId,
        role: 'assistant',
        content: res.content,
        metadata: { traceId: res.traceId },
        createdAt: new Date().toISOString(),
      };
      set((s) => ({ messages: [...s.messages, assistantMsg], sending: false }));
    } catch (err) {
      set({ error: getErrorMessage(err), sending: false });
      throw err;
    }
  },
  appendTraceEvent: (event) =>
    set((s) => ({
      traceEvents: [
        ...s.traceEvents,
        { ...event, id: nextId(), timestamp: Date.now() },
      ],
    })),
  clearTrace: () => set({ traceEvents: [] }),
}));
