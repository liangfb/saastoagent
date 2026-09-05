import { useEffect, useState } from 'react';
import { getErrorMessage, itemsOf } from '@/lib/utils';
import { PageHeader, DataTableShell, StatusBadge } from '@/components/shared';
import { useAgentsStore } from '@/stores';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
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
import { ChevronDown, ChevronRight, MoreHorizontal, Plus } from 'lucide-react';
import { agentsApi } from '@/api/agents';
import { mcpServersApi, type McpTool } from '@/api/mcp-servers';
import type { Agent, McpServer } from '@/types/api';

interface ServerWithTools {
  server: McpServer & { _count?: { tools: number } };
  tools: McpTool[];
  loading: boolean;
}

interface FormState {
  name: string;
  description: string;
  systemPrompt: string;
  status: 'active' | 'inactive';
  selectedToolIds: Set<string>;
}

const emptyForm: FormState = {
  name: '',
  description: '',
  systemPrompt: '',
  status: 'active',
  selectedToolIds: new Set(),
};

export function AgentsPage() {
  const { items, loading, fetchItems, createItem, updateItem, deleteItem } =
    useAgentsStore();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  const [servers, setServers] = useState<ServerWithTools[]>([]);
  const [serversLoading, setServersLoading] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  /** Fetch the catalogue of MCP servers when the dialog opens, then lazy-load
   * each server's tools on first expand. */
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setServersLoading(true);
    (async () => {
      try {
        const data = await mcpServersApi.list({ pageSize: 100 });
        if (cancelled) return;
        const items = itemsOf<McpServer>(data);
        setServers(
          items.map((server) => ({ server, tools: [], loading: false })),
        );
      } finally {
        if (!cancelled) setServersLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const toggleExpand = async (serverId: string) => {
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(serverId)) next.delete(serverId);
      else next.add(serverId);
      return next;
    });
    const entry = servers.find((s) => s.server.id === serverId);
    if (!entry || entry.tools.length > 0 || entry.loading) return;
    setServers((arr) =>
      arr.map((e) => (e.server.id === serverId ? { ...e, loading: true } : e)),
    );
    try {
      const tools = (await mcpServersApi.getTools(
        serverId,
      )) as unknown as McpTool[];
      setServers((arr) =>
        arr.map((e) =>
          e.server.id === serverId
            ? {
                ...e,
                tools: tools.filter((tool) => tool.enabledInMcp),
                loading: false,
              }
            : e,
        ),
      );
    } catch {
      setServers((arr) =>
        arr.map((e) =>
          e.server.id === serverId ? { ...e, loading: false } : e,
        ),
      );
    }
  };

  const toggleTool = (toolId: string) =>
    setForm((f) => {
      const next = new Set(f.selectedToolIds);
      if (next.has(toolId)) next.delete(toolId);
      else next.add(toolId);
      return { ...f, selectedToolIds: next };
    });

  const toggleServerAll = (entry: ServerWithTools) => {
    if (entry.tools.length === 0) return;
    setForm((f) => {
      const next = new Set(f.selectedToolIds);
      const allSelected = entry.tools.every((t) => next.has(t.id));
      if (allSelected) entry.tools.forEach((t) => next.delete(t.id));
      else entry.tools.forEach((t) => next.add(t.id));
      return { ...f, selectedToolIds: next };
    });
  };

  const resetDialog = () => {
    setForm(emptyForm);
    setEditingId(null);
  };

  const openCreate = () => {
    resetDialog();
    setOpen(true);
  };

  const openEdit = async (agent: Agent) => {
    // Seed from list row immediately, then load full detail (incl. bindings).
    setEditingId(agent.id);
    setError(null);
    setForm({
      name: agent.name,
      description: agent.description ?? '',
      systemPrompt: agent.systemPrompt ?? '',
      status: agent.isActive ? 'active' : 'inactive',
      selectedToolIds: new Set(),
    });
    setOpen(true);
    try {
      const detail = (await agentsApi.getById(agent.id)) as unknown as {
        mcpBindings?: Array<{ mcpTool?: { id?: string }; mcpToolId?: string }>;
      };
      const boundToolIds: string[] = (detail?.mcpBindings ?? [])
        .map((b) => b.mcpTool?.id ?? b.mcpToolId)
        .filter((v): v is string => Boolean(v));
      setForm((f) => ({ ...f, selectedToolIds: new Set(boundToolIds) }));
    } catch {
      // keep form usable even if bindings fail to load
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const ids = Array.from(form.selectedToolIds);
      if (editingId) {
        await updateItem(editingId, {
          name: form.name,
          description: form.description || null,
          systemPrompt: form.systemPrompt || null,
          isActive: form.status === 'active',
        });
        await agentsApi.setMcpBindings(editingId, ids);
        await fetchItems();
      } else {
        const created = await createItem({
          name: form.name,
          description: form.description || null,
          systemPrompt: form.systemPrompt || null,
          isActive: form.status === 'active',
        });
        if (ids.length > 0 && created.id) {
          await agentsApi.setMcpBindings(created.id, ids);
          await fetchItems();
        }
      }
      setOpen(false);
      resetDialog();
    } catch (err) {
      setError(
        getErrorMessage(
          err,
          `Failed to ${editingId ? 'update' : 'create'} agent`,
        ),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this agent?')) return;
    try {
      await deleteItem(id);
    } catch (err) {
      alert(getErrorMessage(err, 'Failed to delete'));
    }
  };

  const columns = [
    { header: 'Name', accessor: 'name' as const },
    {
      header: 'Status',
      accessor: (row: Agent) => (
        <StatusBadge status={row.isActive ? 'active' : 'inactive'} />
      ),
    },
    { header: 'Description', accessor: (row: Agent) => row.description ?? '-' },
    {
      header: 'Tools',
      accessor: (row: Agent) =>
        (row as Agent & { _count?: { mcpBindings?: number } })._count
          ?.mcpBindings ?? 0,
    },
    {
      header: 'Actions',
      accessor: (row: Agent) => (
        <DropdownMenu>
          <DropdownMenuTrigger className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent">
            <MoreHorizontal className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => openEdit(row)}>
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive"
              onClick={() => handleDelete(row.id)}
            >
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Agents"
        description="Configure agents that plan tasks and call MCP tools end-to-end (ReAct)."
        action={
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Add Agent
          </Button>
        }
      />
      <DataTableShell
        columns={columns}
        data={items}
        loading={loading}
        emptyMessage="No agents configured yet"
      />

      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) resetDialog();
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>
                {editingId ? 'Edit Agent' : 'Add Agent'}
              </DialogTitle>
              <DialogDescription>
                The agent decides when to call its bound MCP tools and when to
                respond directly.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="agent-name">Name *</Label>
                <Input
                  id="agent-name"
                  placeholder="e.g. Order Management Agent"
                  value={form.name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, name: e.target.value }))
                  }
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="agent-desc">Description</Label>
                <Input
                  id="agent-desc"
                  placeholder="Brief description of this agent's role"
                  value={form.description}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, description: e.target.value }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="agent-prompt">System Prompt</Label>
                <Textarea
                  id="agent-prompt"
                  placeholder="Domain context and rules. ReAct guidance is appended automatically."
                  value={form.systemPrompt}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, systemPrompt: e.target.value }))
                  }
                  rows={3}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="agent-status">Status</Label>
                <select
                  id="agent-status"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={form.status}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      status: e.target.value as 'active' | 'inactive',
                    }))
                  }
                >
                  <option value="active">active</option>
                  <option value="inactive">inactive</option>
                </select>
              </div>
              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <Label>MCP Tools</Label>
                  <span className="text-xs text-muted-foreground">
                    {form.selectedToolIds.size} selected
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Pick tools across one or more MCP servers. The agent will be
                  biased toward these tools first when fulfilling user requests.
                </p>
                <div className="rounded-md border">
                  <ScrollArea className="h-64">
                    <div className="p-1">
                      {serversLoading && servers.length === 0 && (
                        <p className="px-3 py-4 text-sm text-muted-foreground">
                          Loading MCP servers…
                        </p>
                      )}
                      {!serversLoading && servers.length === 0 && (
                        <p className="px-3 py-4 text-sm text-muted-foreground">
                          No MCP servers available. Generate one from an API
                          resource first.
                        </p>
                      )}
                      {servers.map((entry) => {
                        const isOpen = expanded.has(entry.server.id);
                        const allSelected =
                          entry.tools.length > 0 &&
                          entry.tools.every((t) =>
                            form.selectedToolIds.has(t.id),
                          );
                        const someSelected =
                          entry.tools.length > 0 &&
                          entry.tools.some((t) =>
                            form.selectedToolIds.has(t.id),
                          );
                        return (
                          <div key={entry.server.id} className="rounded-md">
                            <div className="flex items-center gap-2 px-2 py-1.5 hover:bg-accent">
                              <button
                                type="button"
                                onClick={() => toggleExpand(entry.server.id)}
                                className="inline-flex h-6 w-6 items-center justify-center rounded hover:bg-muted"
                                aria-label={
                                  isOpen ? 'Collapse server' : 'Expand server'
                                }
                              >
                                {isOpen ? (
                                  <ChevronDown className="h-3 w-3" />
                                ) : (
                                  <ChevronRight className="h-3 w-3" />
                                )}
                              </button>
                              <input
                                type="checkbox"
                                checked={allSelected}
                                ref={(el) => {
                                  if (el)
                                    el.indeterminate =
                                      !allSelected && someSelected;
                                }}
                                onChange={() => {
                                  if (!isOpen) toggleExpand(entry.server.id);
                                  if (entry.tools.length > 0)
                                    toggleServerAll(entry);
                                }}
                                disabled={entry.tools.length === 0 && !isOpen}
                                className="h-4 w-4"
                              />
                              <span
                                className="flex-1 cursor-pointer text-sm font-medium"
                                onClick={() => toggleExpand(entry.server.id)}
                              >
                                {entry.server.name}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {entry.server.status}
                              </span>
                            </div>
                            {isOpen && (
                              <div className="ml-9 border-l py-1 pl-2">
                                {entry.loading && (
                                  <p className="px-2 py-1 text-xs text-muted-foreground">
                                    Loading tools…
                                  </p>
                                )}
                                {!entry.loading && entry.tools.length === 0 && (
                                  <p className="px-2 py-1 text-xs text-muted-foreground">
                                    No tools
                                  </p>
                                )}
                                {entry.tools.map((tool) => (
                                  <label
                                    key={tool.id}
                                    className="flex cursor-pointer items-start gap-2 rounded px-2 py-1 text-sm hover:bg-accent"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={form.selectedToolIds.has(
                                        tool.id,
                                      )}
                                      onChange={() => toggleTool(tool.id)}
                                      className="mt-0.5 h-4 w-4"
                                    />
                                    <div className="flex-1">
                                      <div className="font-mono text-xs">
                                        {tool.toolName}
                                      </div>
                                      {tool.toolDescription && (
                                        <div className="text-xs text-muted-foreground line-clamp-2">
                                          {tool.toolDescription}
                                        </div>
                                      )}
                                    </div>
                                  </label>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                </div>
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
            <DialogFooter>
              <Button type="submit" disabled={submitting || !form.name.trim()}>
                {submitting
                  ? editingId
                    ? 'Saving...'
                    : 'Creating...'
                  : editingId
                    ? 'Save changes'
                    : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
