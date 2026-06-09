import { useEffect, useState } from 'react';
import { getErrorMessage, itemsOf } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import { PageHeader, DataTableShell, StatusBadge } from '@/components/shared';
import { useOpenapiStore } from '@/stores';
import { openapiSourcesApi, type SpecPreview } from '@/api/openapi-sources';
import { credentialsApi } from '@/api/credentials';
import type { Credential } from '@/types/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { MoreHorizontal, Plus } from 'lucide-react';
import type { OpenapiSource } from '@/types/api';
import { parseSpecLocally, deriveBaseUrl } from './spec-utils';

type AddMode = 'url' | 'manual';

export function OpenapiPage() {
  const { items, loading, fetchItems, createItem, deleteItem } = useOpenapiStore();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<AddMode>('url');
  const [form, setForm] = useState({
    name: '',
    sourceUrl: '',
    specContent: '',
    baseUrl: '',
    businessDescription: '',
    credentialId: 'none',
  });
  const [loadingSpec, setLoadingSpec] = useState(false);
  const [preview, setPreview] = useState<SpecPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<Credential[]>([]);

  useEffect(() => {
    fetchItems();
    const interval = setInterval(() => fetchItems(), 5000);
    return () => clearInterval(interval);
  }, [fetchItems]);

  useEffect(() => {
    credentialsApi
      .list({ pageSize: 100 })
      .then((data) => setCredentials(itemsOf<Credential>(data)))
      .catch(() => setCredentials([]));
  }, []);

  const resetDialog = () => {
    setMode('url');
    setForm({
      name: '',
      sourceUrl: '',
      specContent: '',
      baseUrl: '',
      businessDescription: '',
      credentialId: 'none',
    });
    setPreview(null);
    setPreviewError(null);
    setError(null);
  };

  const handleLoad = async () => {
    if (!form.sourceUrl.trim()) {
      setPreviewError('Please enter a Swagger URL first');
      return;
    }
    setLoadingSpec(true);
    setPreviewError(null);
    setPreview(null);
    try {
      const data = (await openapiSourcesApi.preview(form.sourceUrl.trim())) as unknown as SpecPreview;
      setPreview(data);
      if (!form.name.trim() && data?.title) {
        setForm((f) => ({ ...f, name: data.title as string }));
      }
    } catch (err) {
      setPreviewError(getErrorMessage(err, 'Failed to load spec'));
    } finally {
      setLoadingSpec(false);
    }
  };

  // Validate the pasted spec locally and pre-fill name + base URL.
  const handleValidatePaste = () => {
    if (!form.specContent.trim()) {
      setPreviewError('Please paste a Swagger/OpenAPI document first');
      return;
    }
    setPreviewError(null);
    setPreview(null);
    try {
      const data = parseSpecLocally(form.specContent);
      setPreview(data);
      const derived = deriveBaseUrl(data.parsed);
      setForm((f) => ({
        ...f,
        name: f.name.trim() || data.title || f.name,
        baseUrl: f.baseUrl.trim() || derived,
      }));
    } catch (err) {
      setPreviewError(getErrorMessage(err, 'Invalid spec content'));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !preview) return;
    if (mode === 'manual' && !form.baseUrl.trim()) {
      setError('Base URL is required for a pasted spec (the API host the Agent will call).');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const credentialId = form.credentialId === 'none' ? null : form.credentialId;
      if (mode === 'manual') {
        await createItem({
          name: form.name,
          sourceType: 'manual',
          specContent: form.specContent,
          baseUrl: form.baseUrl.trim() || null,
          businessDescription: form.businessDescription || null,
          credentialId,
        } as never);
      } else {
        await createItem({
          name: form.name,
          sourceType: 'url',
          sourceUrl: form.sourceUrl || null,
          businessDescription: form.businessDescription || null,
          credentialId,
        });
      }
      setOpen(false);
      resetDialog();
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to create API'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this API?')) return;
    try {
      await deleteItem(id);
    } catch (err) {
      alert(getErrorMessage(err, 'Failed to delete'));
    }
  };


  const columns = [
    { header: 'Name', accessor: 'name' as const },
    { header: 'Source Type', accessor: 'sourceType' as const },
    {
      header: 'Parse Status',
      accessor: (row: OpenapiSource) => <StatusBadge status={row.parseStatus} />,
    },
    {
      header: 'Endpoints',
      accessor: (row: OpenapiSource) =>
        (row as OpenapiSource & { _count?: { endpoints?: number } })._count?.endpoints ?? 0,
    },
    {
      header: 'MCP Servers',
      accessor: (row: OpenapiSource) =>
        (row as OpenapiSource & { _count?: { mcpServers?: number } })._count?.mcpServers ?? 0,
    },
    {
      header: 'Actions',
      accessor: (row: OpenapiSource) => (
        <DropdownMenu>
          <DropdownMenuTrigger
            onClick={(e) => e.stopPropagation()}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent disabled:opacity-50"
          >
            <MoreHorizontal className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            <DropdownMenuItem onClick={() => navigate(`/openapi/${row.id}/edit`)}>
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(row.id)}>
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
        title="API Resources"
        description="Import and manage OpenAPI specifications"
        action={
          <Button
            onClick={() => {
              resetDialog();
              setOpen(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            Add API
          </Button>
        }
      />

      <ClickableDataTable
        columns={columns}
        data={items}
        loading={loading}
        emptyMessage="No APIs imported yet"
        onRowClick={(row) => navigate(`/openapi/${row.id}`)}
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
              <DialogTitle>Add API</DialogTitle>
              <DialogDescription>
                Load a Swagger/OpenAPI spec from a URL, or paste the document directly when
                the spec endpoint is auth-gated or disabled.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <Tabs
                value={mode}
                onValueChange={(v) => {
                  setMode(v as AddMode);
                  setPreview(null);
                  setPreviewError(null);
                }}
              >
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="url">Load from URL</TabsTrigger>
                  <TabsTrigger value="manual">Paste content</TabsTrigger>
                </TabsList>

                <TabsContent value="url" className="mt-3">
                  <div className="grid gap-2">
                    <Label htmlFor="sourceUrl">Swagger URL *</Label>
                    <div className="flex gap-2">
                      <Input
                        id="sourceUrl"
                        type="url"
                        placeholder="http://mock-erp-sales:9001/openapi.json"
                        value={form.sourceUrl}
                        onChange={(e) => {
                          setForm((f) => ({ ...f, sourceUrl: e.target.value }));
                          setPreview(null);
                        }}
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={handleLoad}
                        disabled={loadingSpec || !form.sourceUrl.trim()}
                      >
                        {loadingSpec ? 'Loading...' : 'Load'}
                      </Button>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="manual" className="mt-3">
                  <div className="grid gap-2">
                    <Label htmlFor="specContent">Swagger / OpenAPI content (JSON or YAML) *</Label>
                    <div className="flex flex-col gap-2">
                      <Textarea
                        id="specContent"
                        placeholder='Paste the full OpenAPI/Swagger document here…'
                        value={form.specContent}
                        onChange={(e) => {
                          setForm((f) => ({ ...f, specContent: e.target.value }));
                          setPreview(null);
                        }}
                        rows={8}
                        className="font-mono text-xs"
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        className="self-start"
                        onClick={handleValidatePaste}
                        disabled={!form.specContent.trim()}
                      >
                        Validate
                      </Button>
                    </div>
                  </div>
                  <div className="mt-3 grid gap-2">
                    <Label htmlFor="baseUrl">API Base URL *</Label>
                    <Input
                      id="baseUrl"
                      type="url"
                      placeholder="https://api.example.com"
                      value={form.baseUrl}
                      onChange={(e) => setForm((f) => ({ ...f, baseUrl: e.target.value }))}
                    />
                    <p className="text-xs text-muted-foreground">
                      The host the Agent will call at runtime. Auto-filled from the spec's
                      servers[] when present; override if needed.
                    </p>
                  </div>
                </TabsContent>
              </Tabs>

              {previewError && <p className="text-sm text-destructive">{previewError}</p>}

              {preview && (
                <div className="grid gap-2">
                  <Label>Loaded Spec Preview</Label>
                  <div className="rounded-md border bg-muted/40 p-3 text-xs">
                    <div className="mb-2 flex flex-wrap gap-3 text-muted-foreground">
                      <span>
                        <b>Version:</b> {preview.specVersion ?? '—'}
                      </span>
                      <span>
                        <b>Title:</b> {preview.title ?? '—'}
                      </span>
                      <span>
                        <b>Paths:</b> {preview.pathCount ?? '—'}
                      </span>
                    </div>
                    <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all font-mono text-[11px]">
                      {preview.raw.length > 8000
                        ? preview.raw.slice(0, 8000) + '\n... (truncated)'
                        : preview.raw}
                    </pre>
                  </div>
                </div>
              )}

              <div className="grid gap-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  placeholder="e.g. Sales Order API"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="desc">Business Description</Label>
                <Textarea
                  id="desc"
                  placeholder="Brief description of this API's business purpose"
                  value={form.businessDescription}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, businessDescription: e.target.value }))
                  }
                  rows={3}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="credential">Authentication</Label>
                <Select
                  value={form.credentialId}
                  onValueChange={(v) => setForm((f) => ({ ...f, credentialId: v as string }))}
                >
                  <SelectTrigger id="credential">
                    <SelectValue placeholder="No authentication" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No authentication</SelectItem>
                    {credentials.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name} ({c.authType})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Select an Identity to authenticate requests when the Agent calls this API.
                  Manage them on the Identity page.
                </p>
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
            <DialogFooter>
              <Button
                type="submit"
                disabled={submitting || !form.name.trim() || !preview}
                title={!preview ? 'Click Load first to fetch the spec' : undefined}
              >
                {submitting ? 'Creating...' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface ClickableDataTableProps<T extends { id: string }> {
  columns: { header: string; accessor: keyof T | ((row: T) => React.ReactNode) }[];
  data: T[];
  loading?: boolean;
  emptyMessage?: string;
  onRowClick?: (row: T) => void;
}

function ClickableDataTable<T extends { id: string }>({
  columns,
  data,
  loading,
  emptyMessage,
  onRowClick,
}: ClickableDataTableProps<T>) {
  if (!onRowClick || (loading && data.length === 0) || data.length === 0) {
    return <DataTableShell columns={columns} data={data} loading={loading} emptyMessage={emptyMessage} />;
  }
  return (
    <div className="rounded-md border">
      <table className="w-full caption-bottom text-sm">
        <thead className="[&_tr]:border-b">
          <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
            {columns.map((col, i) => (
              <th
                key={i}
                className="h-10 px-2 text-left align-middle font-medium text-muted-foreground"
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="[&_tr:last-child]:border-0">
          {data.map((row) => (
            <tr
              key={row.id}
              onClick={() => onRowClick(row)}
              className="cursor-pointer border-b transition-colors hover:bg-muted/50"
            >
              {columns.map((col, i) => (
                <td key={i} className="p-2 align-middle">
                  {typeof col.accessor === 'function'
                    ? col.accessor(row)
                    : String(row[col.accessor] ?? '-')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
