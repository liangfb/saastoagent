import { useEffect, useMemo, useState } from 'react';
import { Activity, Eye, ExternalLink, RefreshCw } from 'lucide-react';
import { PageHeader, DataTableShell } from '@/components/shared';
import { useLogsStore } from '@/stores';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { logsApi, type LogQueryParams } from '@/api/observability';
import type { LogEntry, Trace } from '@/types/api';

const traceColumns = [
  {
    header: 'Trace ID',
    accessor: (row: Trace) =>
      row.langfuseUrl ? (
        <a
          href={row.langfuseUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-primary hover:underline"
        >
          {row.id}
          <ExternalLink className="h-3 w-3" />
        </a>
      ) : (
        row.id
      ),
  },
  { header: 'Name', accessor: 'name' as const },
  {
    header: 'Duration',
    accessor: (row: Trace) => (row.duration != null ? `${row.duration}ms` : '-'),
  },
  {
    header: 'Started',
    accessor: (row: Trace) => new Date(row.createdAt).toLocaleString(),
  },
];

interface LogFilters {
  action: string;
  resourceType: string;
  traceId: string;
  status: string;
  toolName: string;
}

const emptyFilters: LogFilters = {
  action: '',
  resourceType: '',
  traceId: '',
  status: '',
  toolName: '',
};

export function LogsPage() {
  const { logs, traces, loading, error, fetchLogs, fetchTraces, appendLog } = useLogsStore();
  const [filters, setFilters] = useState<LogFilters>(emptyFilters);
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null);
  const [live, setLive] = useState(false);

  const query = useMemo<LogQueryParams>(() => {
    const entries = Object.entries(filters).filter(([, value]) => value.trim());
    return Object.fromEntries(entries) as LogQueryParams;
  }, [filters]);

  const logColumns = useMemo(
    () => [
      {
        header: 'Time',
        accessor: (row: LogEntry) => new Date(row.timestamp).toLocaleString(),
      },
      {
        header: 'Status',
        accessor: (row: LogEntry) => (
          <Badge variant={row.level === 'error' ? 'destructive' : 'secondary'}>
            {row.status ?? row.level}
          </Badge>
        ),
      },
      {
        header: 'Action',
        accessor: (row: LogEntry) => row.action ?? row.message,
      },
      {
        header: 'Resource',
        accessor: (row: LogEntry) =>
          row.resourceType
            ? `${row.resourceType}${row.resourceId ? `/${row.resourceId}` : ''}`
            : row.service,
      },
      {
        header: 'Trace',
        accessor: (row: LogEntry) => row.traceId ?? '-',
      },
      {
        header: '',
        accessor: (row: LogEntry) => (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setSelectedLog(row)}
            aria-label="View log details"
          >
            <Eye className="h-4 w-4" />
          </Button>
        ),
      },
    ],
    [],
  );

  useEffect(() => {
    fetchLogs(query);
    fetchTraces();
  }, [fetchLogs, fetchTraces, query]);

  useEffect(() => {
    if (!live) return;
    const controller = new AbortController();
    const token = localStorage.getItem('auth_token');

    void streamAuditLogs(controller, token, appendLog);
    return () => controller.abort();
  }, [appendLog, live]);

  const updateFilter = (key: keyof LogFilters, value: string) =>
    setFilters((current) => ({ ...current, [key]: value }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Observability"
        description="Logs and distributed traces"
        action={
          <div className="flex gap-2">
            <Button variant={live ? 'default' : 'outline'} onClick={() => setLive((v) => !v)}>
              <Activity className="h-4 w-4" />
              {live ? 'Live on' : 'Live'}
            </Button>
            <Button variant="outline" onClick={() => fetchLogs(query)}>
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
          </div>
        }
      />
      <Tabs defaultValue="logs">
        <TabsList>
          <TabsTrigger value="logs">Logs</TabsTrigger>
          <TabsTrigger value="traces">Traces</TabsTrigger>
        </TabsList>
        <TabsContent value="logs">
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-5">
              <Input
                value={filters.action}
                onChange={(event) => updateFilter('action', event.target.value)}
                placeholder="Action"
              />
              <Input
                value={filters.resourceType}
                onChange={(event) => updateFilter('resourceType', event.target.value)}
                placeholder="Resource"
              />
              <Input
                value={filters.status}
                onChange={(event) => updateFilter('status', event.target.value)}
                placeholder="Status"
              />
              <Input
                value={filters.toolName}
                onChange={(event) => updateFilter('toolName', event.target.value)}
                placeholder="Tool"
              />
              <Input
                value={filters.traceId}
                onChange={(event) => updateFilter('traceId', event.target.value)}
                placeholder="Trace ID"
              />
            </div>
            {error ? <div className="text-sm text-destructive">{error}</div> : null}
            <DataTableShell
              columns={logColumns}
              data={logs}
              loading={loading}
              emptyMessage="No log entries yet"
            />
          </div>
        </TabsContent>
        <TabsContent value="traces">
          <DataTableShell
            columns={traceColumns}
            data={traces}
            loading={loading}
            emptyMessage="No traces recorded yet"
          />
        </TabsContent>
      </Tabs>
      <Dialog open={Boolean(selectedLog)} onOpenChange={(open) => !open && setSelectedLog(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {selectedLog?.action ?? selectedLog?.message ?? 'Log details'}
            </DialogTitle>
          </DialogHeader>
          <pre className="max-h-[60vh] overflow-auto rounded-md bg-muted p-3 text-xs">
            {selectedLog ? JSON.stringify(selectedLog, null, 2) : ''}
          </pre>
        </DialogContent>
      </Dialog>
    </div>
  );
}

async function streamAuditLogs(
  controller: AbortController,
  token: string | null,
  appendLog: (log: LogEntry) => void,
) {
  const response = await fetch(logsApi.streamUrl(), {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    signal: controller.signal,
  });
  if (!response.ok || !response.body) return;

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (!controller.signal.aborted) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split('\n\n');
    buffer = chunks.pop() ?? '';
    for (const chunk of chunks) {
      const log = parseAuditEvent(chunk);
      if (log) appendLog(log);
    }
  }
}

function parseAuditEvent(chunk: string): LogEntry | null {
  const dataLine = chunk.split('\n').find((line) => line.startsWith('data:'));
  if (!dataLine) return null;
  try {
    const payload = JSON.parse(dataLine.slice('data:'.length).trim());
    return {
      id: String(payload.id),
      level: ['failed', 'denied', 'blocked'].includes(payload.details?.status) ? 'error' : 'info',
      service: payload.resourceType ?? 'system',
      message: payload.action,
      action: payload.action,
      resourceType: payload.resourceType,
      resourceId: payload.resourceId,
      userId: payload.userId,
      traceId: payload.traceId,
      status: payload.details?.status ?? null,
      toolName: payload.details?.toolName ?? null,
      details: payload.details ?? null,
      timestamp: payload.createdAt,
    };
  } catch {
    return null;
  }
}
