import { useEffect } from 'react';
import { ExternalLink } from 'lucide-react';
import { PageHeader, DataTableShell } from '@/components/shared';
import { useLogsStore } from '@/stores';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { LogEntry, Trace } from '@/types/api';

const logColumns = [
  {
    header: 'Timestamp',
    accessor: (row: LogEntry) => new Date(row.timestamp).toLocaleString(),
  },
  { header: 'Level', accessor: 'level' as const },
  { header: 'Service', accessor: 'service' as const },
  { header: 'Message', accessor: 'message' as const },
];

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

export function LogsPage() {
  const { logs, traces, loading, fetchLogs, fetchTraces } = useLogsStore();

  useEffect(() => {
    fetchLogs();
    fetchTraces();
  }, [fetchLogs, fetchTraces]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Observability"
        description="Logs and distributed traces"
      />
      <Tabs defaultValue="logs">
        <TabsList>
          <TabsTrigger value="logs">Logs</TabsTrigger>
          <TabsTrigger value="traces">Traces</TabsTrigger>
        </TabsList>
        <TabsContent value="logs">
          <DataTableShell columns={logColumns} data={logs} loading={loading} emptyMessage="No log entries yet" />
        </TabsContent>
        <TabsContent value="traces">
          <DataTableShell columns={traceColumns} data={traces} loading={loading} emptyMessage="No traces recorded yet" />
        </TabsContent>
      </Tabs>
    </div>
  );
}
