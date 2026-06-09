import { useEffect, useMemo, useRef, useState } from 'react';
import { getErrorMessage } from '@/lib/utils';
import { useSessionsStore, useAgentsStore, type TraceEvent } from '@/stores';
import { useSessionStream } from '@/hooks/use-session-stream';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { ArrowUp, History, Plus, Trash2, Activity, X, Bot } from 'lucide-react';
import type { Message, Session } from '@/types/api';

function ChatMessage({ message }: { message: Message }) {
  const isUser = message.role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
          isUser ? 'bg-primary text-primary-foreground' : 'bg-muted'
        }`}
      >
        {message.content || <span className="italic opacity-60">(empty)</span>}
      </div>
    </div>
  );
}

function SessionListPanel({ onSelect }: { onSelect?: () => void }) {
  const {
    items,
    activeSessionId,
    setActiveSession,
    createSession,
    deleteSession,
    loadMessages,
  } = useSessionsStore();
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const session = await createSession({
        title: `Session ${new Date().toLocaleString()}`,
      });
      setActiveSession(session.id);
      onSelect?.();
    } catch {
      // ignore
    } finally {
      setCreating(false);
    }
  };

  const handleSelect = (session: Session) => {
    setActiveSession(session.id);
    loadMessages(session.id);
    onSelect?.();
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm('Delete this session?')) return;
    await deleteSession(id);
  };

  return (
    <div className="flex h-full flex-col gap-3">
      <Button variant="outline" size="sm" onClick={handleCreate} disabled={creating}>
        <Plus className="mr-1 h-3 w-3" />
        {creating ? 'Creating…' : 'New Session'}
      </Button>
      <ScrollArea className="flex-1">
        <div className="space-y-1 pr-2">
          {items.map((s) => (
            <div
              key={s.id}
              onClick={() => handleSelect(s)}
              className={`group flex cursor-pointer items-center justify-between rounded-md px-3 py-2 text-sm hover:bg-accent ${
                activeSessionId === s.id ? 'bg-accent' : ''
              }`}
            >
              <span className="truncate">{s.title || s.id.slice(0, 8)}</span>
              <button
                onClick={(e) => handleDelete(e, s.id)}
                className="ml-2 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
          {items.length === 0 && (
            <p className="px-3 py-2 text-xs text-muted-foreground">No sessions yet</p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function HistoryDrawer() {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button variant="outline" size="sm" aria-label="Open chat history">
            <History className="mr-1 h-4 w-4" />
            History
          </Button>
        }
      />
      <SheetContent side="left" className="flex w-72 flex-col gap-3 p-4 sm:max-w-xs">
        <SheetHeader className="p-0">
          <SheetTitle>Chat History</SheetTitle>
        </SheetHeader>
        <SessionListPanel onSelect={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}

interface ComposerProps {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  large?: boolean;
}

function Composer({
  value,
  onChange,
  onSubmit,
  disabled,
  placeholder,
  autoFocus,
  large,
}: ComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!disabled && value.trim()) onSubmit();
    }
  };

  // Clicking anywhere in the padded box should focus the textarea, not just
  // the single text line. The textarea itself fills the box so the caret sits
  // top-left with consistent padding.
  const focusTextarea = () => textareaRef.current?.focus();

  const canSend = !disabled && !!value.trim();
  return (
    <div
      onClick={focusTextarea}
      className={`relative flex w-full cursor-text flex-col rounded-2xl border bg-card px-4 py-3 shadow-sm ${
        large ? 'min-h-[140px]' : ''
      }`}
    >
      <Textarea
        ref={textareaRef}
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKey}
        placeholder={placeholder ?? 'Type a message…'}
        rows={large ? 4 : 1}
        className="min-h-0 flex-1 resize-none border-0 bg-transparent p-0 pr-10 align-top shadow-none focus-visible:ring-0"
      />
      <Button
        type="button"
        size="icon"
        className="absolute bottom-3 right-3 h-9 w-9 shrink-0 rounded-full"
        onClick={(e) => {
          e.stopPropagation();
          onSubmit();
        }}
        disabled={!canSend}
        aria-label="Send"
      >
        <ArrowUp className="h-4 w-4" />
      </Button>
    </div>
  );
}

interface AgentOption {
  id: string;
  name: string;
}

function AgentSelect({
  agents,
  value,
  onChange,
  disabled,
}: {
  agents: AgentOption[];
  value: string | null;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  const nameById = (id: string | null) =>
    agents.find((a) => a.id === id)?.name ?? '';

  return (
    <Select
      value={value ?? ''}
      onValueChange={(v) => v && onChange(v as string)}
      disabled={disabled}
    >
      <SelectTrigger className="h-9 w-56">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 shrink-0 text-muted-foreground" />
          <SelectValue placeholder="Select an agent">
            {(v: string) => nameById(v) || 'Select an agent'}
          </SelectValue>
        </div>
      </SelectTrigger>
      <SelectContent>
        {agents.length === 0 && (
          <div className="px-2 py-1.5 text-sm text-muted-foreground">No agents yet</div>
        )}
        {agents.map((a) => (
          <SelectItem key={a.id} value={a.id}>
            {a.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function HeroEmpty({
  draft,
  onChange,
  onSubmit,
  sending,
  agents,
  agentId,
  onAgentChange,
}: {
  draft: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  sending: boolean;
  agents: AgentOption[];
  agentId: string | null;
  onAgentChange: (id: string) => void;
}) {
  const noAgents = agents.length === 0;
  return (
    <div className="brand-glow mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-6 px-6 py-12">
      <div className="text-center">
        <h1 className="brand-gradient-text text-3xl font-semibold leading-tight tracking-tight sm:whitespace-nowrap sm:text-4xl lg:text-[2.75rem]">
          Ready to transform your SaaS to AI Agent?
        </h1>
        <p className="mt-3 text-sm text-muted-foreground sm:text-base">
          Turn any REST API into an AI Agent — start chatting below.
        </p>
      </div>
      <div className="flex w-full flex-col items-start gap-3">
        <AgentSelect agents={agents} value={agentId} onChange={onAgentChange} />
        <Composer
          value={draft}
          onChange={onChange}
          onSubmit={onSubmit}
          disabled={sending || !agentId}
          placeholder={
            noAgents
              ? 'Create an agent first to start chatting'
              : !agentId
                ? 'Select an agent above to start'
                : 'Ask anything about your business'
          }
          autoFocus
          large
        />
        {noAgents && (
          <p className="text-xs text-muted-foreground">
            No agents available — head to the Agents page to create one.
          </p>
        )}
      </div>
    </div>
  );
}

interface TraceEventData {
  content?: unknown;
  arguments?: unknown;
  toolName?: unknown;
  result?: unknown;
  durationMs?: unknown;
  message?: unknown;
  tokenUsage?: unknown;
}

function formatEventSummary(event: TraceEvent): string {
  const d = event.data as TraceEventData;
  switch (event.type) {
    case 'thinking':
      return String(d.content ?? 'Thinking');
    case 'tool_call': {
      const args = d.arguments ? JSON.stringify(d.arguments).slice(0, 120) : '';
      return `${d.toolName}(${args})`;
    }
    case 'tool_result': {
      const preview = JSON.stringify(d.result ?? {}).slice(0, 120);
      return `${d.toolName} → ${preview}${preview.length >= 120 ? '…' : ''} (${d.durationMs}ms)`;
    }
    case 'tool_error':
      return `${d.toolName} failed: ${d.message}`;
    case 'response':
      return String(d.content ?? '').slice(0, 160);
    case 'done': {
      const usage = d.tokenUsage ? ` tokens=${JSON.stringify(d.tokenUsage)}` : '';
      return `Done${usage}`;
    }
    case 'error':
      return String(d.message ?? 'Error');
  }
}

function TracePanel({ onClose }: { onClose: () => void }) {
  const traceEvents = useSessionsStore((s) => s.traceEvents);
  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className="text-sm">Trace</CardTitle>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Hide trace">
          <X className="h-3 w-3" />
        </Button>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden p-0">
        <ScrollArea className="h-full px-4 pb-4">
          {traceEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Send a message to see the agent execution trace here.
            </p>
          ) : (
            <ol className="space-y-2">
              {traceEvents.map((e) => (
                <li
                  key={e.id}
                  className="rounded-md border border-border/60 bg-background/40 px-3 py-2 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-semibold uppercase text-muted-foreground">
                      {e.type}
                    </span>
                    <span className="text-muted-foreground">
                      {new Date(e.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="mt-1 break-words">{formatEventSummary(e)}</p>
                </li>
              ))}
            </ol>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

export function PlaygroundPage() {
  const {
    items: sessions,
    fetchItems,
    activeSessionId,
    setActiveSession,
    createSession,
    sendMessage,
    messages,
    sending,
    error,
  } = useSessionsStore();
  const { items: agents, fetchItems: fetchAgents } = useAgentsStore();
  useSessionStream(activeSessionId);

  const [draft, setDraft] = useState('');
  const [showTrace, setShowTrace] = useState(false);
  // The agent chosen for a *new* session (hero state). Existing sessions are
  // already bound to an agent on the backend, so we display that instead.
  const [pendingAgentId, setPendingAgentId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchItems();
    fetchAgents();
  }, [fetchItems, fetchAgents]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const agentOptions = useMemo(
    () => agents.map((a) => ({ id: a.id, name: a.name })),
    [agents],
  );

  // Default the hero agent picker to the first agent once loaded — derived
  // during render (not via setState in an effect) so there's no extra pass.
  const effectiveAgentId = pendingAgentId ?? agentOptions[0]?.id ?? null;

  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const activeAgent = activeSession
    ? agentOptions.find((a) => a.id === activeSession.agentId)
    : undefined;

  const handleSubmit = async () => {
    const content = draft.trim();
    if (!content || sending) return;
    let sessionId = activeSessionId;
    if (!sessionId) {
      if (!effectiveAgentId) {
        alert('Select an agent first');
        return;
      }
      try {
        const s = await createSession({
          title: content.slice(0, 48) || `Session ${new Date().toLocaleString()}`,
          agentId: effectiveAgentId,
        });
        sessionId = s.id;
        setActiveSession(s.id);
      } catch (err) {
        alert(getErrorMessage(err, 'Failed to start a new session'));
        return;
      }
    }
    setDraft('');
    try {
      await sendMessage(sessionId!, content);
    } catch {
      // surfaced via store.error
    }
  };

  const showHero = !activeSessionId && messages.length === 0;

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col">
      <div className="flex items-center justify-between gap-2 border-b pb-3">
        <div className="flex items-center gap-2">
          <HistoryDrawer />
          {!showHero && activeAgent && (
            <span className="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm text-muted-foreground">
              <Bot className="h-4 w-4" />
              {activeAgent.name}
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowTrace((s) => !s)}
          aria-pressed={showTrace}
        >
          <Activity className="mr-1 h-4 w-4" />
          {showTrace ? 'Hide trace' : 'Show trace'}
        </Button>
      </div>

      <div className="flex flex-1 gap-4 overflow-hidden pt-4">
        <div className="flex flex-1 flex-col overflow-hidden">
          {showHero ? (
            <HeroEmpty
              draft={draft}
              onChange={setDraft}
              onSubmit={handleSubmit}
              sending={sending}
              agents={agentOptions}
              agentId={effectiveAgentId}
              onAgentChange={setPendingAgentId}
            />
          ) : (
            <>
              <ScrollArea className="flex-1 px-4">
                <div className="mx-auto max-w-3xl space-y-4 py-4">
                  {messages.map((msg) => (
                    <ChatMessage key={msg.id} message={msg} />
                  ))}
                  {sending && (
                    <div className="flex justify-start">
                      <div className="max-w-[80%] rounded-2xl bg-muted px-4 py-2 text-sm italic opacity-70">
                        Agent is thinking…
                      </div>
                    </div>
                  )}
                  <div ref={scrollRef} />
                </div>
              </ScrollArea>
              {error && (
                <div className="border-t border-destructive/40 bg-destructive/10 px-4 py-2 text-xs text-destructive">
                  {error}
                </div>
              )}
              <div className="p-4">
                <div className="mx-auto max-w-3xl">
                  <Composer
                    value={draft}
                    onChange={setDraft}
                    onSubmit={handleSubmit}
                    disabled={sending}
                    placeholder={sending ? 'Waiting for agent…' : 'Type a message…'}
                    large
                  />
                </div>
              </div>
            </>
          )}
        </div>
        {showTrace && (
          <div className="w-[28rem] shrink-0">
            <TracePanel onClose={() => setShowTrace(false)} />
          </div>
        )}
      </div>
    </div>
  );
}
