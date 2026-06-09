import { useEffect, useMemo, useState } from 'react';
import { getErrorMessage } from '@/lib/utils';
import { PageHeader, DataTableShell } from '@/components/shared';
import { useModelsStore } from '@/stores';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { MoreHorizontal, Plus } from 'lucide-react';
import type { LlmConfig, LlmProvider, UsageType } from '@/types/api';

const providers: { value: LlmProvider; label: string }[] = [
  { value: 'anthropic', label: 'Anthropic (Claude)' },
  { value: 'openai', label: 'OpenAI (GPT)' },
  { value: 'google', label: 'Google (Gemini)' },
  { value: 'bedrock', label: 'AWS Bedrock' },
];

const usageTypes: { value: UsageType; label: string; description: string }[] = [
  { value: 'semantic_enhancement', label: 'Semantic Enhancement', description: 'Enhances OpenAPI endpoint descriptions' },
  { value: 'agent_reasoning', label: 'Agent Reasoning', description: 'Specialist agent tool-calling' },
  { value: 'intent_classification', label: 'Intent Classification', description: 'Router agent intent matching' },
];

interface ConfigForm {
  name: string;
  provider: LlmProvider;
  modelId: string;
  apiEndpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  apiKey: string;
}

const emptyForm: ConfigForm = {
  name: '',
  provider: 'bedrock',
  modelId: '',
  apiEndpoint: '',
  region: 'us-west-2',
  accessKeyId: '',
  secretAccessKey: '',
  apiKey: '',
};

/**
 * Build credentials from form fields. In edit mode, returning `undefined`
 * tells the caller "user did not enter any new credentials, keep what's
 * already on the server" — so existing keys aren't overwritten with empty
 * strings. The list API returns masked credentials, so editing without
 * `undefined` semantics would corrupt the stored values.
 */
function buildCredentials(
  form: ConfigForm,
  mode: 'create' | 'edit',
): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  if (form.provider === 'bedrock') {
    if (form.accessKeyId.trim()) out.accessKeyId = form.accessKeyId.trim();
    if (form.secretAccessKey.trim()) out.secretAccessKey = form.secretAccessKey.trim();
    if (form.region.trim()) out.region = form.region.trim();
  } else if (form.apiKey.trim()) {
    out.apiKey = form.apiKey.trim();
  }
  if (mode === 'edit' && Object.keys(out).length === 0) return undefined;
  return out;
}

export function ModelsPage() {
  const {
    configs,
    assignments,
    loading,
    fetchConfigs,
    fetchAssignments,
    createConfig,
    updateConfig,
    deleteConfig,
    updateAssignments,
  } = useModelsStore();

  const [dialogMode, setDialogMode] = useState<'closed' | 'create' | 'edit'>('closed');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<ConfigForm>(emptyForm);

  const [assignmentDraft, setAssignmentDraft] = useState<Record<UsageType, string>>({
    semantic_enhancement: '',
    agent_reasoning: '',
    intent_classification: '',
  });
  const [savingAssignments, setSavingAssignments] = useState(false);

  useEffect(() => {
    fetchConfigs();
    fetchAssignments();
  }, [fetchConfigs, fetchAssignments]);

  useEffect(() => {
    const draft: Record<UsageType, string> = {
      semantic_enhancement: '',
      agent_reasoning: '',
      intent_classification: '',
    };
    for (const a of assignments) draft[a.usageType] = a.llmConfigId;
    setAssignmentDraft(draft);
  }, [assignments]);

  const openCreate = () => {
    setForm(emptyForm);
    setEditingId(null);
    setError(null);
    setDialogMode('create');
  };

  const openEdit = (row: LlmConfig) => {
    setForm({
      name: row.name,
      provider: row.provider,
      modelId: row.modelId,
      apiEndpoint: row.apiEndpoint ?? '',
      region: row.region ?? 'us-west-2',
      accessKeyId: '',
      secretAccessKey: '',
      apiKey: '',
    });
    setEditingId(row.id);
    setError(null);
    setDialogMode('edit');
  };

  const closeDialog = () => {
    setDialogMode('closed');
    setEditingId(null);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.modelId.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      if (dialogMode === 'edit' && editingId) {
        const credentials = buildCredentials(form, 'edit');
        await updateConfig(editingId, {
          name: form.name,
          provider: form.provider,
          modelId: form.modelId,
          apiEndpoint: form.apiEndpoint || null,
          region: form.provider === 'bedrock' ? form.region || null : null,
          ...(credentials !== undefined && { credentials }),
        });
      } else {
        await createConfig({
          name: form.name,
          provider: form.provider,
          modelId: form.modelId,
          apiEndpoint: form.apiEndpoint || null,
          region: form.provider === 'bedrock' ? form.region || null : null,
          credentials: buildCredentials(form, 'create') ?? {},
          isActive: true,
          defaultParams: {},
        });
      }
      closeDialog();
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to save config'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this LLM configuration?')) return;
    try {
      await deleteConfig(id);
    } catch (err) {
      alert(getErrorMessage(err, 'Failed to delete'));
    }
  };

  const handleSaveAssignments = async () => {
    const entries = Object.entries(assignmentDraft)
      .filter(([, id]) => !!id)
      .map(([usageType, llmConfigId]) => ({ usageType, llmConfigId }));
    if (entries.length === 0) return;
    setSavingAssignments(true);
    try {
      await updateAssignments(entries);
    } catch (err) {
      alert(getErrorMessage(err, 'Failed to save assignments'));
    } finally {
      setSavingAssignments(false);
    }
  };

  const configColumns = [
    { header: 'Name', accessor: 'name' as const },
    { header: 'Provider', accessor: 'provider' as const },
    { header: 'Model ID', accessor: 'modelId' as const },
    { header: 'Region', accessor: (row: LlmConfig) => row.region || '—' },
    {
      header: 'Actions',
      accessor: (row: LlmConfig) => (
        <DropdownMenu>
          <DropdownMenuTrigger className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent">
            <MoreHorizontal className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => openEdit(row)}>Edit</DropdownMenuItem>
            <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(row.id)}>
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  const configOptions = useMemo(
    () => configs.map((c) => ({ value: c.id, label: `${c.name} (${c.provider}/${c.modelId})` })),
    [configs],
  );

  const isEdit = dialogMode === 'edit';

  return (
    <div className="space-y-6">
      <PageHeader
        title="LLM Models"
        description="Configure language models and assign them to pipeline usage types"
        action={
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Add Config
          </Button>
        }
      />
      <DataTableShell
        columns={configColumns}
        data={configs}
        loading={loading}
        emptyMessage="No LLM configurations yet"
      />

      <div>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Model Assignments</h3>
          <Button
            size="sm"
            onClick={handleSaveAssignments}
            disabled={savingAssignments || configs.length === 0}
          >
            {savingAssignments ? 'Saving...' : 'Save Assignments'}
          </Button>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {usageTypes.map((ut) => (
            <Card key={ut.value}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">{ut.label}</CardTitle>
                <p className="text-xs text-muted-foreground">{ut.description}</p>
              </CardHeader>
              <CardContent>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                  value={assignmentDraft[ut.value]}
                  onChange={(e) =>
                    setAssignmentDraft((d) => ({ ...d, [ut.value]: e.target.value }))
                  }
                >
                  <option value="">— Select config —</option>
                  {configOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <Dialog open={dialogMode !== 'closed'} onOpenChange={(v) => !v && closeDialog()}>
        <DialogContent className="sm:max-w-lg">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>
                {isEdit ? 'Edit LLM Configuration' : 'Add LLM Configuration'}
              </DialogTitle>
              <DialogDescription>
                {isEdit
                  ? 'Update model details. Leave credential fields blank to keep the existing values.'
                  : 'Configure a language model provider, model, and credentials.'}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="llm-name">Name *</Label>
                <Input
                  id="llm-name"
                  placeholder="e.g. Claude Sonnet via Bedrock"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="llm-provider">Provider</Label>
                <select
                  id="llm-provider"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                  value={form.provider}
                  onChange={(e) => setForm((f) => ({ ...f, provider: e.target.value as LlmProvider }))}
                >
                  {providers.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="llm-model">Model ID *</Label>
                <Input
                  id="llm-model"
                  placeholder={
                    form.provider === 'bedrock'
                      ? 'e.g. anthropic.claude-3-5-sonnet-20241022-v2:0'
                      : 'e.g. claude-sonnet-4-20250514'
                  }
                  value={form.modelId}
                  onChange={(e) => setForm((f) => ({ ...f, modelId: e.target.value }))}
                  required
                />
              </div>

              {form.provider === 'bedrock' ? (
                <>
                  <div className="grid gap-2">
                    <Label htmlFor="llm-region">AWS Region</Label>
                    <Input
                      id="llm-region"
                      placeholder="us-west-2"
                      value={form.region}
                      onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="llm-access-key">
                      AWS Access Key ID{' '}
                      {isEdit && <span className="text-muted-foreground">(blank = unchanged)</span>}
                    </Label>
                    <Input
                      id="llm-access-key"
                      placeholder={isEdit ? 'Leave blank to keep current' : 'AKIA...'}
                      value={form.accessKeyId}
                      onChange={(e) => setForm((f) => ({ ...f, accessKeyId: e.target.value }))}
                    />
                    {!isEdit && (
                      <p className="text-xs text-muted-foreground">
                        Leave blank to use the pod's IAM role / environment credentials.
                      </p>
                    )}
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="llm-secret-key">
                      AWS Secret Access Key{' '}
                      {isEdit && <span className="text-muted-foreground">(blank = unchanged)</span>}
                    </Label>
                    <Textarea
                      id="llm-secret-key"
                      placeholder={isEdit ? 'Leave blank to keep current' : 'Secret access key'}
                      rows={2}
                      value={form.secretAccessKey}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, secretAccessKey: e.target.value }))
                      }
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="grid gap-2">
                    <Label htmlFor="llm-endpoint">API Endpoint (optional)</Label>
                    <Input
                      id="llm-endpoint"
                      placeholder="Custom endpoint URL"
                      value={form.apiEndpoint}
                      onChange={(e) => setForm((f) => ({ ...f, apiEndpoint: e.target.value }))}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="llm-api-key">
                      API Key{' '}
                      {isEdit && <span className="text-muted-foreground">(blank = unchanged)</span>}
                    </Label>
                    <Input
                      id="llm-api-key"
                      type="password"
                      placeholder={isEdit ? 'Leave blank to keep current' : 'sk-...'}
                      value={form.apiKey}
                      onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))}
                    />
                  </div>
                </>
              )}

              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
            <DialogFooter>
              <Button
                type="submit"
                disabled={submitting || !form.name.trim() || !form.modelId.trim()}
              >
                {submitting
                  ? isEdit
                    ? 'Saving...'
                    : 'Creating...'
                  : isEdit
                    ? 'Save'
                    : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
