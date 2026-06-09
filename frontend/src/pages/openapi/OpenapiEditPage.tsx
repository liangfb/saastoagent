import { useEffect, useState } from 'react';
import { getErrorMessage, itemsOf } from '@/lib/utils';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { openapiSourcesApi, type SpecPreview } from '@/api/openapi-sources';
import { credentialsApi } from '@/api/credentials';
import { useOpenapiStore } from '@/stores';
import type { Credential, OpenapiSource } from '@/types/api';
import { parseSpecLocally, deriveBaseUrl } from './spec-utils';

type DetailSource = OpenapiSource & { rawSpec?: unknown };
type EditMode = 'url' | 'manual';

export function OpenapiEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { updateItem } = useOpenapiStore();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [regenBusy, setRegenBusy] = useState(false);
  const [loadingSpec, setLoadingSpec] = useState(false);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [mode, setMode] = useState<EditMode>('url');
  const [specError, setSpecError] = useState<string | null>(null);
  const [specValid, setSpecValid] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: '',
    sourceUrl: '',
    baseUrl: '',
    specContent: '',
    businessDescription: '',
    credentialId: 'none',
  });

  useEffect(() => {
    credentialsApi
      .list({ pageSize: 100 })
      .then((data) => setCredentials(itemsOf<Credential>(data)))
      .catch(() => setCredentials([]));
  }, []);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const src = (await openapiSourcesApi.getById(id)) as unknown as DetailSource;
        if (cancelled) return;
        // Initialize the mode from the source type, but allow switching.
        setMode(src.sourceType === 'manual' ? 'manual' : 'url');
        setForm({
          name: src.name ?? '',
          sourceUrl: src.sourceUrl ?? '',
          baseUrl: src.baseUrl ?? '',
          specContent: src.rawSpec ? JSON.stringify(src.rawSpec, null, 2) : '',
          businessDescription: src.businessDescription ?? '',
          credentialId: src.credentialId ?? 'none',
        });
      } catch (err) {
        if (!cancelled) setError(getErrorMessage(err, 'Failed to load'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Fetch + preview the spec from a URL (same as Add API's Load button).
  const handleLoadFromUrl = async () => {
    if (!form.sourceUrl.trim()) {
      setSpecError('Please enter a Swagger URL first');
      return;
    }
    setLoadingSpec(true);
    setSpecError(null);
    setSpecValid(null);
    try {
      const data = (await openapiSourcesApi.preview(form.sourceUrl.trim())) as unknown as SpecPreview;
      setSpecValid(
        `Loaded ${data.specVersion ? `v${data.specVersion}` : 'spec'}${
          data.pathCount != null ? ` · ${data.pathCount} paths` : ''
        }`,
      );
      if (!form.name.trim() && data.title) {
        setForm((f) => ({ ...f, name: data.title as string }));
      }
    } catch (err) {
      setSpecError(getErrorMessage(err, 'Failed to load spec'));
    } finally {
      setLoadingSpec(false);
    }
  };

  const handleValidatePaste = () => {
    setSpecError(null);
    setSpecValid(null);
    try {
      const data = parseSpecLocally(form.specContent);
      const derived = deriveBaseUrl(data.parsed);
      setForm((f) => ({ ...f, baseUrl: f.baseUrl.trim() || derived }));
      setSpecValid(
        `Valid ${data.specVersion ? `v${data.specVersion}` : 'spec'}${
          data.pathCount != null ? ` · ${data.pathCount} paths` : ''
        }`,
      );
    } catch (err) {
      setSpecError(getErrorMessage(err, 'Invalid spec content'));
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !form.name.trim()) return;
    if (mode === 'url' && !form.sourceUrl.trim()) {
      setError('Swagger URL is required in "Load from URL" mode.');
      return;
    }
    if (mode === 'manual' && !form.baseUrl.trim()) {
      setError('Base URL is required for a pasted spec (the API host the Agent will call).');
      return;
    }
    if (mode === 'manual' && !form.specContent.trim()) {
      setError('Paste the Swagger/OpenAPI content, or switch to "Load from URL".');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const credentialId = form.credentialId === 'none' ? null : form.credentialId;
      const payload: Partial<OpenapiSource> & { specContent?: string } = {
        name: form.name,
        sourceType: mode,
        businessDescription: form.businessDescription || null,
        credentialId,
      };
      if (mode === 'url') {
        payload.sourceUrl = form.sourceUrl || null;
      } else {
        payload.baseUrl = form.baseUrl.trim() || null;
        payload.specContent = form.specContent;
      }
      await updateItem(id, payload as never);
      navigate(`/openapi/${id}`);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to save'));
    } finally {
      setSaving(false);
    }
  };

  const handleRegenerate = async () => {
    if (!id) return;
    setRegenBusy(true);
    setError(null);
    try {
      await openapiSourcesApi.regenerate(id);
      alert('Regenerate pipeline enqueued. Watch the status on the detail page or the Logs page.');
    } catch (err) {
      alert(getErrorMessage(err, 'Regenerate failed'));
    } finally {
      setRegenBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate(`/openapi/${id}`)}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <h2 className="text-2xl font-bold tracking-tight">Edit API</h2>
        </div>
        <Button variant="outline" onClick={handleRegenerate} disabled={regenBusy || loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${regenBusy ? 'animate-spin' : ''}`} />
          {regenBusy ? 'Enqueueing…' : 'Regenerate'}
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <form onSubmit={handleSave}>
          <Card>
            <CardHeader>
              <CardTitle>Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  required
                />
              </div>

              <Tabs
                value={mode}
                onValueChange={(v) => {
                  setMode(v as EditMode);
                  setSpecValid(null);
                  setSpecError(null);
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
                          setSpecValid(null);
                        }}
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={handleLoadFromUrl}
                        disabled={loadingSpec || !form.sourceUrl.trim()}
                      >
                        {loadingSpec ? 'Loading…' : 'Load'}
                      </Button>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="manual" className="mt-3 space-y-4">
                  <div className="grid gap-2">
                    <Label htmlFor="specContent">Swagger / OpenAPI content (JSON or YAML) *</Label>
                    <Textarea
                      id="specContent"
                      placeholder="Paste the full OpenAPI/Swagger document here…"
                      value={form.specContent}
                      onChange={(e) => {
                        setForm((f) => ({ ...f, specContent: e.target.value }));
                        setSpecValid(null);
                        setSpecError(null);
                      }}
                      rows={10}
                      className="font-mono text-xs"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="self-start"
                      onClick={handleValidatePaste}
                      disabled={!form.specContent.trim()}
                    >
                      Validate
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      Editing the content replaces the stored spec. Validate to refresh the base
                      URL, then Regenerate to rebuild the MCP server.
                    </p>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="baseUrl">API Base URL *</Label>
                    <Input
                      id="baseUrl"
                      type="url"
                      placeholder="https://api.example.com"
                      value={form.baseUrl}
                      onChange={(e) => setForm((f) => ({ ...f, baseUrl: e.target.value }))}
                    />
                  </div>
                </TabsContent>
              </Tabs>

              {(specValid || specError) && (
                <p className={`text-xs ${specError ? 'text-destructive' : 'text-emerald-600'}`}>
                  {specError ?? specValid}
                </p>
              )}

              <div className="grid gap-2">
                <Label htmlFor="desc">Business Description</Label>
                <Textarea
                  id="desc"
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
                  Identity used to authenticate requests when the Agent calls this API. Changes
                  take effect after Regenerate.
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => navigate(`/openapi/${id}`)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={saving || !form.name.trim()}>
                  {saving ? 'Saving…' : 'Save changes'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </form>
      )}
    </div>
  );
}
