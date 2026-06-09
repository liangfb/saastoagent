import { useEffect } from 'react';
import { sessionsApi } from '@/api/sessions';
import { useSessionsStore, type TraceEvent } from '@/stores/sessions.store';

const KNOWN_TYPES: TraceEvent['type'][] = [
  'thinking',
  'tool_call',
  'tool_result',
  'tool_error',
  'response',
  'done',
  'error',
];

/**
 * Subscribe to a session's SSE stream while `sessionId` is active.
 * Events are appended to `traceEvents` in the sessions store.
 */
export function useSessionStream(sessionId: string | null) {
  const appendTraceEvent = useSessionsStore((s) => s.appendTraceEvent);

  useEffect(() => {
    if (!sessionId) return;
    const url = sessionsApi.streamUrl(sessionId);
    const source = new EventSource(url);

    const register = (type: TraceEvent['type']) => {
      source.addEventListener(type, (event: MessageEvent) => {
        try {
          const data = event.data ? JSON.parse(event.data) : {};
          appendTraceEvent({ type, data });
        } catch {
          appendTraceEvent({ type, data: { raw: event.data } });
        }
      });
    };

    KNOWN_TYPES.forEach(register);

    source.onerror = () => {
      // EventSource auto-reconnects; surface only once when the stream closes
      // after a manual `done` by the backend (broker.complete).
    };

    return () => {
      source.close();
    };
  }, [sessionId, appendTraceEvent]);
}
