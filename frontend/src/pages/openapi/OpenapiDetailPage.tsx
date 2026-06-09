import { useEffect, useState } from 'react';
import { getErrorMessage, itemsOf } from '@/lib/utils';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/shared';
import { openapiSourcesApi } from '@/api/openapi-sources';
import { mcpServersApi, type McpTool } from '@/api/mcp-servers';
import type { McpServer, OpenapiSource } from '@/types/api';

type DetailSource = OpenapiSource & {
  rawSpec?: unknown;
  _count?: { endpoints?: number; mcpServers?: number };
};

type ServerWithTools = McpServer & { tools: McpTool[] };

export function OpenapiDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<DetailSource | null>(null);
  const [servers, setServers] = useState<ServerWithTools[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [specCollapsed, setSpecCollapsed] = useState(true);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [source, serverList] = await Promise.all([
          openapiSourcesApi.getById(id),
          mcpServersApi.list({ pageSize: 100, openapiSourceId: id }),
        ]);
        if (cancelled) return;
        setDetail(source as unknown as DetailSource);
        const items = itemsOf<McpServer>(serverList);
        const withTools = await Promise.all(
          items.map(async (s: McpServer) => {
            try {
              const tools = await mcpServersApi.getTools(s.id);
              return { ...s, tools: (tools as unknown as McpTool[]) ?? [] };
            } catch {
              return { ...s, tools: [] };
            }
          }),
        );
        if (!cancelled) setServers(withTools);
      } catch (err) {
        if (!cancelled) setError(getErrorMessage(err, 'Failed to load'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const rawJson = detail?.rawSpec
    ? JSON.stringify(detail.rawSpec, null, 2)
    : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/openapi')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <h2 className="text-2xl font-bold tracking-tight">
            {detail?.name ?? (loading ? 'Loading…' : 'API Details')}
          </h2>
        </div>
        {detail && (
          <Button onClick={() => navigate(`/openapi/${id}/edit`)}>
            <Pencil className="mr-2 h-4 w-4" />
            Edit
          </Button>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {detail && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Overview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <Field label="Source Type" value={detail.sourceType} />
                <Field
                  label="Parse Status"
                  value={<StatusBadge status={detail.parseStatus} />}
                />
                <Field label="Spec Version" value={detail.specVersion ?? '—'} />
                <Field
                  label="Endpoints"
                  value={String(detail._count?.endpoints ?? 0)}
                />
                <Field
                  label="MCP Servers"
                  value={String(detail._count?.mcpServers ?? 0)}
                />
                <Field
                  label="Updated"
                  value={new Date(detail.updatedAt).toLocaleString()}
                />
              </div>
              <Field
                label="Source URL"
                value={
                  detail.sourceUrl ? (
                    <code className="break-all text-xs">{detail.sourceUrl}</code>
                  ) : (
                    '—'
                  )
                }
              />
              {detail.businessDescription && (
                <Field
                  label="Business Description"
                  value={<span className="whitespace-pre-wrap">{detail.businessDescription}</span>}
                />
              )}
            </CardContent>
          </Card>

          {rawJson && (
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>Swagger / OpenAPI Spec</CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSpecCollapsed((v) => !v)}
                >
                  {specCollapsed ? 'Show' : 'Hide'}
                </Button>
              </CardHeader>
              {!specCollapsed && (
                <CardContent>
                  <pre className="max-h-96 overflow-auto rounded-md border bg-muted/40 p-3 font-mono text-[11px] leading-relaxed">
                    {rawJson.length > 20000
                      ? rawJson.slice(0, 20000) + '\n... (truncated)'
                      : rawJson}
                  </pre>
                </CardContent>
              )}
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>MCP Servers ({servers.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {servers.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No MCP server generated yet. Use Edit → Regenerate to build it.
                </p>
              )}
              {servers.map((server) => (
                <div key={server.id} className="rounded-md border p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="font-medium">{server.name}</div>
                    <StatusBadge status={server.status} />
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {server.tools.length} tool{server.tools.length === 1 ? '' : 's'}
                  </div>
                  {server.tools.length > 0 && (
                    <ul className="mt-3 space-y-2">
                      {server.tools.map((tool) => (
                        <li
                          key={tool.id}
                          className="rounded-md border bg-muted/30 p-2 text-xs"
                        >
                          <div className="font-mono font-medium">{tool.toolName}</div>
                          {tool.toolDescription && (
                            <div className="mt-1 text-muted-foreground">
                              {tool.toolDescription}
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}

      {loading && !detail && (
        <p className="text-sm text-muted-foreground">Loading…</p>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div>{value}</div>
    </div>
  );
}
