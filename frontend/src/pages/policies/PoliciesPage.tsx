import { useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  MoreHorizontal,
  Plus,
  ShieldCheck,
} from 'lucide-react';
import { mcpServersApi, type McpTool } from '@/api/mcp-servers';
import { policiesApi, type PolicyPayload } from '@/api/policies';
import { PageHeader, DataTableShell } from '@/components/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { getErrorMessage, itemsOf } from '@/lib/utils';
import type { McpServer, Policy, PolicyRule } from '@/types/api';

interface ServerWithTools {
  server: McpServer;
  tools: McpTool[];
  loading: boolean;
  loaded: boolean;
}

interface PolicyForm {
  name: string;
  description: string;
  enabled: boolean;
  priority: string;
  selectedToolIds: Set<string>;
  rules: string;
}

const createEmptyForm = (): PolicyForm => ({
  name: '',
  description: '',
  enabled: false,
  priority: '0',
  selectedToolIds: new Set(),
  rules: JSON.stringify(
    [
      {
        id: 'deny-example',
        phase: 'pre_tool',
        effect: 'deny',
        when: { field: 'args.amount', op: 'gt', value: 100000 },
        reason: 'Amount exceeds the autonomous execution limit',
      },
    ],
    null,
    2,
  ),
});

const scopeToolIds = (scope: Record<string, unknown>) =>
  Array.isArray(scope.mcpToolIds)
    ? scope.mcpToolIds.filter((id): id is string => typeof id === 'string')
    : [];

export function PoliciesPage() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogMode, setDialogMode] = useState<'closed' | 'create' | 'edit'>('closed');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PolicyForm>(createEmptyForm);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [servers, setServers] = useState<ServerWithTools[]>([]);
  const [serversLoading, setServersLoading] = useState(false);
  const [serversError, setServersError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const loadPolicies = async () => {
    setLoading(true);
    try {
      const data = await policiesApi.list({ pageSize: 100 });
      setPolicies(itemsOf<Policy>(data));
      setError(null);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load policies'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadPolicies();
  }, []);

  useEffect(() => {
    if (dialogMode === 'closed') return;
    let cancelled = false;
    setServersLoading(true);
    setServersError(null);
    setExpanded(new Set());
    void (async () => {
      try {
        const data = await mcpServersApi.list({ pageSize: 100 });
        if (cancelled) return;
        setServers(
          itemsOf<McpServer>(data).map((server) => ({
            server,
            tools: [],
            loading: false,
            loaded: false,
          })),
        );
      } catch (err) {
        if (!cancelled) {
          setServers([]);
          setServersError(getErrorMessage(err, 'Failed to load MCP servers'));
        }
      } finally {
        if (!cancelled) setServersLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dialogMode]);

  const toggleExpand = async (serverId: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(serverId)) next.delete(serverId);
      else next.add(serverId);
      return next;
    });

    const entry = servers.find(({ server }) => server.id === serverId);
    if (!entry || entry.loaded || entry.loading) return;
    setServers((current) =>
      current.map((item) =>
        item.server.id === serverId ? { ...item, loading: true } : item,
      ),
    );
    try {
      const tools = (await mcpServersApi.getTools(serverId)) as unknown as McpTool[];
      setServers((current) =>
        current.map((item) =>
          item.server.id === serverId
            ? {
                ...item,
                tools: tools.filter((tool) => tool.enabledInMcp),
                loading: false,
                loaded: true,
              }
            : item,
        ),
      );
    } catch (err) {
      setServers((current) =>
        current.map((item) =>
          item.server.id === serverId ? { ...item, loading: false } : item,
        ),
      );
      setServersError(getErrorMessage(err, 'Failed to load MCP tools'));
    }
  };

  const toggleTool = (toolId: string) => {
    setForm((current) => {
      const selectedToolIds = new Set(current.selectedToolIds);
      if (selectedToolIds.has(toolId)) selectedToolIds.delete(toolId);
      else selectedToolIds.add(toolId);
      return { ...current, selectedToolIds };
    });
  };

  const toggleServerTools = (entry: ServerWithTools) => {
    if (entry.tools.length === 0) return;
    setForm((current) => {
      const selectedToolIds = new Set(current.selectedToolIds);
      const allSelected = entry.tools.every((tool) => selectedToolIds.has(tool.id));
      entry.tools.forEach((tool) => {
        if (allSelected) selectedToolIds.delete(tool.id);
        else selectedToolIds.add(tool.id);
      });
      return { ...current, selectedToolIds };
    });
  };

  const openCreate = () => {
    setForm(createEmptyForm());
    setEditingId(null);
    setError(null);
    setDialogMode('create');
  };

  const openEdit = (policy: Policy) => {
    setForm({
      name: policy.name,
      description: policy.description ?? '',
      enabled: policy.enabled,
      priority: String(policy.priority),
      selectedToolIds: new Set(scopeToolIds(policy.scope ?? {})),
      rules: JSON.stringify(policy.rules ?? [], null, 2),
    });
    setEditingId(policy.id);
    setError(null);
    setDialogMode('edit');
  };

  const closeDialog = () => {
    setDialogMode('closed');
    setEditingId(null);
    setError(null);
  };

  const parsePayload = (): PolicyPayload => {
    let rules: PolicyRule[];
    try {
      rules = JSON.parse(form.rules) as PolicyRule[];
    } catch {
      throw new Error('Rules must be valid JSON');
    }
    if (form.selectedToolIds.size === 0) {
      throw new Error('Select at least one MCP tool');
    }
    if (!Array.isArray(rules) || rules.length === 0) {
      throw new Error('Rules must be a non-empty JSON array');
    }
    return {
      name: form.name.trim(),
      description: form.description.trim() || null,
      enabled: form.enabled,
      priority: Number(form.priority),
      scope: { mcpToolIds: [...form.selectedToolIds] },
      rules,
    };
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.name.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const payload = parsePayload();
      if (dialogMode === 'edit' && editingId) {
        await policiesApi.update(editingId, payload);
      } else {
        await policiesApi.create(payload);
      }
      closeDialog();
      await loadPolicies();
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to save policy'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (policy: Policy) => {
    if (!confirm(`Delete policy "${policy.name}"?`)) return;
    try {
      await policiesApi.delete(policy.id);
      await loadPolicies();
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to delete policy'));
    }
  };

  const columns = useMemo(
    () => [
      { header: 'Name', accessor: 'name' as const },
      {
        header: 'Status',
        accessor: (row: Policy) => (
          <Badge variant={row.enabled ? 'default' : 'secondary'}>
            {row.enabled ? 'Active' : 'Inactive'}
          </Badge>
        ),
      },
      { header: 'Priority', accessor: 'priority' as const },
      {
        header: 'Phases',
        accessor: (row: Policy) =>
          [...new Set(row.rules.map((rule) => rule.phase))]
            .map((phase) => (phase === 'pre_tool' ? 'Pre-tool' : 'Post-tool'))
            .join(', '),
      },
      { header: 'Rules', accessor: (row: Policy) => row.rules.length },
      { header: 'Version', accessor: (row: Policy) => `v${row.version}` },
      {
        header: '',
        accessor: (row: Policy) => (
          <DropdownMenu>
            <DropdownMenuTrigger
              className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent"
              aria-label="Policy actions"
            >
              <MoreHorizontal className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => openEdit(row)}>Edit</DropdownMenuItem>
              <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(row)}>
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Policies"
        description="Enforce rules before and after MCP tool calls"
        action={
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Add policy
          </Button>
        }
      />
      {error && dialogMode === 'closed' ? (
        <div className="text-sm text-destructive">{error}</div>
      ) : null}
      <DataTableShell
        columns={columns}
        data={policies}
        loading={loading}
        emptyMessage="No policies configured"
      />

      <Dialog open={dialogMode !== 'closed'} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <form onSubmit={handleSubmit} className="space-y-5">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5" />
                {dialogMode === 'edit' ? 'Edit policy' : 'Add policy'}
              </DialogTitle>
              <DialogDescription>
                Deny rules take precedence. Post-tool denial blocks the result after the upstream
                call has completed.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
              <div className="space-y-2">
                <Label htmlFor="policy-name">Name</Label>
                <Input
                  id="policy-name"
                  value={form.name}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="policy-priority">Priority</Label>
                <Input
                  id="policy-priority"
                  type="number"
                  min={-10000}
                  max={10000}
                  value={form.priority}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      priority: event.target.value,
                    }))
                  }
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="policy-description">Description</Label>
              <Input
                id="policy-description"
                value={form.description}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
              />
            </div>

            <div className="space-y-1">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={form.enabled}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      enabled: event.target.checked,
                    }))
                  }
                  className="h-4 w-4 accent-primary"
                />
                Active
              </label>
              <p className="pl-6 text-xs text-muted-foreground">
                Inactive policies remain saved but are ignored during tool calls.
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-4">
                <Label>MCP Tools</Label>
                <span className="text-xs text-muted-foreground">
                  {form.selectedToolIds.size} selected
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Select the MCP servers and tools this policy applies to. Only tools enabled for MCP
                exposure are shown.
              </p>
              <div className="rounded-md border">
                <ScrollArea className="h-56">
                  <div className="p-1">
                    {serversLoading && servers.length === 0 ? (
                      <p className="px-3 py-4 text-sm text-muted-foreground">
                        Loading MCP servers...
                      </p>
                    ) : null}
                    {!serversLoading && !serversError && servers.length === 0 ? (
                      <p className="px-3 py-4 text-sm text-muted-foreground">
                        No MCP servers available.
                      </p>
                    ) : null}
                    {servers.map((entry) => {
                      const isOpen = expanded.has(entry.server.id);
                      const allSelected =
                        entry.tools.length > 0 &&
                        entry.tools.every((tool) => form.selectedToolIds.has(tool.id));
                      const someSelected = entry.tools.some((tool) =>
                        form.selectedToolIds.has(tool.id),
                      );
                      return (
                        <div key={entry.server.id} className="rounded-md">
                          <div className="flex items-center gap-2 px-2 py-1.5 hover:bg-accent">
                            <button
                              type="button"
                              onClick={() => void toggleExpand(entry.server.id)}
                              className="inline-flex h-6 w-6 items-center justify-center rounded hover:bg-muted"
                              aria-label={isOpen ? 'Collapse server' : 'Expand server'}
                            >
                              {isOpen ? (
                                <ChevronDown className="h-3 w-3" />
                              ) : (
                                <ChevronRight className="h-3 w-3" />
                              )}
                            </button>
                            <input
                              type="checkbox"
                              aria-label={`Select all tools from ${entry.server.name}`}
                              checked={allSelected}
                              ref={(element) => {
                                if (element) element.indeterminate = !allSelected && someSelected;
                              }}
                              onChange={() => toggleServerTools(entry)}
                              disabled={!entry.loaded || entry.tools.length === 0}
                              className="h-4 w-4"
                            />
                            <button
                              type="button"
                              className="min-w-0 flex-1 truncate text-left text-sm font-medium"
                              onClick={() => void toggleExpand(entry.server.id)}
                            >
                              {entry.server.name}
                            </button>
                            <span className="text-xs text-muted-foreground">
                              {entry.loaded ? `${entry.tools.length} tools` : entry.server.status}
                            </span>
                          </div>
                          {isOpen ? (
                            <div className="ml-9 border-l py-1 pl-2">
                              {entry.loading ? (
                                <p className="px-2 py-1 text-xs text-muted-foreground">
                                  Loading tools...
                                </p>
                              ) : null}
                              {entry.loaded && entry.tools.length === 0 ? (
                                <p className="px-2 py-1 text-xs text-muted-foreground">
                                  No enabled tools
                                </p>
                              ) : null}
                              {entry.tools.map((tool) => (
                                <label
                                  key={tool.id}
                                  className="flex cursor-pointer items-start gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent"
                                >
                                  <input
                                    type="checkbox"
                                    checked={form.selectedToolIds.has(tool.id)}
                                    onChange={() => toggleTool(tool.id)}
                                    className="mt-0.5 h-4 w-4"
                                  />
                                  <span className="min-w-0 flex-1">
                                    <span className="block truncate font-mono text-xs">
                                      {tool.toolName}
                                    </span>
                                    {tool.toolDescription ? (
                                      <span className="line-clamp-2 block text-xs text-muted-foreground">
                                        {tool.toolDescription}
                                      </span>
                                    ) : null}
                                  </span>
                                </label>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              </div>
              {serversError ? (
                <p className="text-xs text-destructive">{serversError}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="policy-rules">Rules</Label>
              <Textarea
                id="policy-rules"
                className="min-h-64 font-mono text-xs"
                value={form.rules}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    rules: event.target.value,
                  }))
                }
                spellCheck={false}
              />
            </div>

            {error ? <div className="text-sm text-destructive">{error}</div> : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDialog}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={submitting || !form.name.trim() || form.selectedToolIds.size === 0}
              >
                {submitting ? 'Saving...' : 'Save policy'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
