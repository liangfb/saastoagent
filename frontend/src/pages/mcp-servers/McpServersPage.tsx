import { useEffect, useState } from 'react';
import { getErrorMessage, itemsOf } from '@/lib/utils';
import { PageHeader, StatusBadge } from '@/components/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Play, RotateCcw, Save, Square } from 'lucide-react';
import { mcpServersApi, type McpTool } from '@/api';
import type { McpServer, McpServerStatus } from '@/types/api';

interface ServerWithCounts extends McpServer {
  openapiSource?: { id: string; name: string };
  _count?: { tools: number };
  enabledToolCount?: number;
  serverConfig?: Record<string, unknown>;
}

export function McpServersPage() {
  const [servers, setServers] = useState<ServerWithCounts[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [tools, setTools] = useState<Record<string, McpTool[]>>({});
  const [originalEnabled, setOriginalEnabled] = useState<
    Record<string, Record<string, boolean>>
  >({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [savingToolsId, setSavingToolsId] = useState<string | null>(null);
  const [logsDialog, setLogsDialog] = useState<{
    open: boolean;
    content: string;
    serverId: string | null;
  }>({
    open: false,
    content: '',
    serverId: null,
  });

  const fetchServers = async () => {
    setLoading(true);
    try {
      const data = await mcpServersApi.list();
      setServers(itemsOf<McpServer>(data));
    } catch {
      setServers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchServers();
    const interval = setInterval(fetchServers, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleExpand = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    if (!tools[id]) {
      try {
        const data = (await mcpServersApi.getTools(id)) as unknown as McpTool[];
        setTools((t) => ({ ...t, [id]: data }));
        setOriginalEnabled((state) => ({
          ...state,
          [id]: Object.fromEntries(
            data.map((tool) => [tool.id, tool.enabledInMcp]),
          ),
        }));
      } catch {
        setTools((t) => ({ ...t, [id]: [] }));
        setOriginalEnabled((state) => ({ ...state, [id]: {} }));
      }
    }
  };

  const handleViewLogs = async (id: string) => {
    try {
      const res = (await mcpServersApi.getLogs(id)) as unknown as {
        logs: string;
      };
      setLogsDialog({ open: true, content: res.logs, serverId: id });
    } catch (error) {
      setLogsDialog({
        open: true,
        content: `Error loading logs: ${error}`,
        serverId: id,
      });
    }
  };

  const updateLocalStatus = (id: string, status: McpServerStatus) =>
    setServers((s) =>
      s.map((srv) => (srv.id === id ? { ...srv, status } : srv)),
    );

  const handleStart = async (id: string) => {
    setBusyId(id);
    try {
      await mcpServersApi.start(id);
      updateLocalStatus(id, 'running');
      await fetchServers();
    } catch (err) {
      alert(getErrorMessage(err, 'Failed to start MCP server'));
    } finally {
      setBusyId(null);
    }
  };

  const handleStop = async (id: string) => {
    if (
      !confirm(
        'Stop this MCP server? It will scale to 0 replicas and become unavailable to agents.',
      )
    )
      return;
    setBusyId(id);
    try {
      await mcpServersApi.stop(id);
      updateLocalStatus(id, 'stopped');
      await fetchServers();
    } catch (err) {
      alert(getErrorMessage(err, 'Failed to stop MCP server'));
    } finally {
      setBusyId(null);
    }
  };

  const toggleToolEnabled = (serverId: string, toolId: string) => {
    setTools((state) => ({
      ...state,
      [serverId]: (state[serverId] ?? []).map((tool) =>
        tool.id === toolId
          ? { ...tool, enabledInMcp: !tool.enabledInMcp }
          : tool,
      ),
    }));
  };

  const resetToolChanges = (serverId: string) => {
    const snapshot = originalEnabled[serverId] ?? {};
    setTools((state) => ({
      ...state,
      [serverId]: (state[serverId] ?? []).map((tool) => ({
        ...tool,
        enabledInMcp: snapshot[tool.id] ?? tool.enabledInMcp,
      })),
    }));
  };

  const saveToolChanges = async (serverId: string) => {
    const current = tools[serverId] ?? [];
    setSavingToolsId(serverId);
    try {
      const result = (await mcpServersApi.updateToolsEnabled(serverId, {
        tools: current.map((tool) => ({
          id: tool.id,
          enabledInMcp: tool.enabledInMcp,
        })),
        apply: true,
      })) as unknown as { enabledToolCount: number; tools: McpTool[] };
      setTools((state) => ({ ...state, [serverId]: result.tools }));
      setOriginalEnabled((state) => ({
        ...state,
        [serverId]: Object.fromEntries(
          result.tools.map((tool) => [tool.id, tool.enabledInMcp]),
        ),
      }));
      setServers((state) =>
        state.map((server) =>
          server.id === serverId
            ? { ...server, enabledToolCount: result.enabledToolCount }
            : server,
        ),
      );
      await fetchServers();
    } catch (err) {
      alert(getErrorMessage(err, 'Failed to update MCP tools'));
    } finally {
      setSavingToolsId(null);
    }
  };

  const enabledCountFor = (server: ServerWithCounts) => {
    const loadedTools = tools[server.id];
    if (loadedTools)
      return loadedTools.filter((tool) => tool.enabledInMcp).length;
    return server.enabledToolCount ?? server._count?.tools ?? 0;
  };

  const hasToolChanges = (serverId: string) => {
    const snapshot = originalEnabled[serverId];
    const current = tools[serverId];
    if (!snapshot || !current) return false;
    return current.some((tool) => snapshot[tool.id] !== tool.enabledInMcp);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="MCP Servers"
        description="Generated MCP Server configurations and tools"
      />
      {loading && servers.length === 0 && (
        <p className="text-sm text-muted-foreground">Loading...</p>
      )}
      {!loading && servers.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No MCP servers generated yet. Run Generate MCP on an OpenAPI source.
        </p>
      )}
      <div className="grid gap-4">
        {servers.map((server) => {
          const isRunning = server.status === 'running';
          const isBusy = busyId === server.id;
          return (
            <Card key={server.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-base">{server.name}</CardTitle>
                    <p className="text-xs text-muted-foreground">
                      From source:{' '}
                      {server.openapiSource?.name ?? server.openapiSourceId}
                    </p>
                    <div className="mt-1">
                      <span className="text-xs text-muted-foreground">
                        Endpoint:{' '}
                      </span>
                      {(server.serverConfig as { endpointUrl?: string } | null)
                        ?.endpointUrl ? (
                        <code className="text-xs break-all">
                          {
                            (server.serverConfig as { endpointUrl?: string })
                              .endpointUrl
                          }
                        </code>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={server.status} />
                    <span className="text-sm text-muted-foreground">
                      {enabledCountFor(server)} / {server._count?.tools ?? 0}{' '}
                      tools enabled
                    </span>
                    {isRunning ? (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={isBusy}
                        onClick={() => handleStop(server.id)}
                      >
                        <Square className="mr-1 h-3 w-3" />
                        {isBusy ? 'Stopping…' : 'Stop'}
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={isBusy}
                        onClick={() => handleStart(server.id)}
                      >
                        <Play className="mr-1 h-3 w-3" />
                        {isBusy ? 'Starting…' : 'Start'}
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleViewLogs(server.id)}
                    >
                      View Logs
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleExpand(server.id)}
                    >
                      {expandedId === server.id ? 'Hide Tools' : 'View Tools'}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              {expandedId === server.id && (
                <CardContent>
                  {tools[server.id]?.length ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between pb-1">
                        <span className="text-xs text-muted-foreground">
                          Changes are applied to the running MCP runtime when
                          saved.
                        </span>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={
                              !hasToolChanges(server.id) ||
                              savingToolsId === server.id
                            }
                            onClick={() => resetToolChanges(server.id)}
                          >
                            <RotateCcw className="mr-1 h-3 w-3" />
                            Reset
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={
                              !hasToolChanges(server.id) ||
                              savingToolsId === server.id
                            }
                            onClick={() => saveToolChanges(server.id)}
                          >
                            <Save className="mr-1 h-3 w-3" />
                            {savingToolsId === server.id ? 'Saving…' : 'Save'}
                          </Button>
                        </div>
                      </div>
                      {tools[server.id].map((tool) => (
                        <div key={tool.id} className="rounded-md border p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="break-all font-mono text-sm font-semibold">
                                {tool.toolName}
                              </p>
                            </div>
                            <label className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                              <input
                                type="checkbox"
                                className="h-4 w-4"
                                checked={tool.enabledInMcp}
                                onChange={() =>
                                  toggleToolEnabled(server.id, tool.id)
                                }
                              />
                              Enable
                            </label>
                          </div>
                          <p className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">
                            {tool.toolDescription}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No tools</p>
                  )}
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>
      <Dialog
        open={logsDialog.open}
        onOpenChange={(open) => setLogsDialog((s) => ({ ...s, open }))}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>MCP Server Logs</DialogTitle>
          </DialogHeader>
          <pre className="max-h-96 overflow-auto text-xs bg-muted rounded p-3">
            {logsDialog.content || 'No logs'}
          </pre>
        </DialogContent>
      </Dialog>
    </div>
  );
}
