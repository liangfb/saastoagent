import { useEffect, useState } from 'react';
import { getErrorMessage } from '@/lib/utils';
import { PageHeader, DataTableShell, StatusBadge } from '@/components/shared';
import { useCredentialsStore } from '@/stores';
import { credentialsApi } from '@/api/credentials';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
import { MoreHorizontal, Plus, Eye, EyeOff } from 'lucide-react';
import type { AuthType, Credential } from '@/types/api';

const authTypes: { value: AuthType; label: string }[] = [
  { value: 'api_key', label: 'API Key' },
  { value: 'oauth2', label: 'OAuth 2.0' },
  { value: 'bearer_token', label: 'Bearer Token' },
];

const authTypeLabel = (v: string) => authTypes.find((t) => t.value === v)?.label ?? v;

const CONFIG_PLACEHOLDER =
  '{\n  "key_name": "X-API-Key",\n  "key_value": "sk-...",\n  "key_location": "header"\n}';

/** Mask every string value in a config object, returning pretty JSON. */
function maskedConfigJson(config: Record<string, unknown>): string {
  const masked: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(config)) {
    masked[k] = typeof v === 'string' ? '•'.repeat(Math.min(Math.max(v.length, 8), 24)) : v;
  }
  return JSON.stringify(masked, null, 2);
}

const statusOptions = ['active', 'inactive'] as const;

/** ISO datetime -> "YYYY-MM-DD" for a date input (empty when null). */
function isoToDateInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

/** "YYYY-MM-DD" from a date input -> ISO datetime (null when empty). */
function dateInputToIso(date: string): string | null {
  if (!date) return null;
  const d = new Date(`${date}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function IdentityPage() {
  const { items, loading, fetchItems, createItem, updateItem, deleteItem } = useCredentialsStore();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    authType: 'api_key' as AuthType,
    config: '',
    status: 'active' as 'active' | 'inactive',
    expiresAt: '',
  });

  const [viewing, setViewing] = useState<Credential | null>(null);
  const [editing, setEditing] = useState<Credential | null>(null);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      let config: Record<string, unknown> = {};
      if (form.config.trim()) {
        try {
          config = JSON.parse(form.config);
        } catch {
          setError('Config must be valid JSON');
          setSubmitting(false);
          return;
        }
      }
      await createItem({
        name: form.name,
        authType: form.authType,
        config,
        status: form.status,
        expiresAt: dateInputToIso(form.expiresAt),
      } as Partial<Credential>);
      setOpen(false);
      setForm({ name: '', authType: 'api_key', config: '', status: 'active', expiresAt: '' });
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to create credential'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this credential?')) return;
    try {
      await deleteItem(id);
    } catch (err) {
      alert(getErrorMessage(err, 'Failed to delete'));
    }
  };

  const columns = [
    { header: 'Name', accessor: 'name' as const },
    { header: 'Auth Type', accessor: (row: Credential) => authTypeLabel(row.authType) },
    { header: 'Status', accessor: (row: Credential) => <StatusBadge status={row.status} /> },
    {
      header: 'Expires At',
      accessor: (row: Credential) =>
        row.expiresAt ? new Date(row.expiresAt).toLocaleDateString() : '-',
    },
    {
      header: 'Actions',
      accessor: (row: Credential) => (
        <DropdownMenu>
          <DropdownMenuTrigger className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent">
            <MoreHorizontal className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setViewing(row)}>View details</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setEditing(row)}>Edit</DropdownMenuItem>
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
        title="Identity"
        description="Manage API credentials and authentication keys"
        action={
          <Button onClick={() => setOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Identity
          </Button>
        }
      />
      <DataTableShell columns={columns} data={items} loading={loading} emptyMessage="No identity configured yet" />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>Add Identity</DialogTitle>
              <DialogDescription>Configure authentication for an API endpoint.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="cred-name">Name *</Label>
                <Input
                  id="cred-name"
                  placeholder="e.g. Production API Key"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="auth-type">Auth Type</Label>
                <select
                  id="auth-type"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={form.authType}
                  onChange={(e) => setForm((f) => ({ ...f, authType: e.target.value as AuthType }))}
                >
                  {authTypes.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="cred-config">Config (JSON)</Label>
                <Textarea
                  id="cred-config"
                  placeholder={CONFIG_PLACEHOLDER}
                  value={form.config}
                  onChange={(e) => setForm((f) => ({ ...f, config: e.target.value }))}
                  rows={8}
                  className="font-mono text-xs"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="cred-status">Status</Label>
                  <select
                    id="cred-status"
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    value={form.status}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, status: e.target.value as 'active' | 'inactive' }))
                    }
                  >
                    {statusOptions.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="cred-expires">Expires At</Label>
                  <Input
                    id="cred-expires"
                    type="date"
                    value={form.expiresAt}
                    onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))}
                  />
                </div>
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
            <DialogFooter>
              <Button type="submit" disabled={submitting || !form.name.trim()}>
                {submitting ? 'Creating...' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {viewing && <ViewCredentialDialog credential={viewing} onClose={() => setViewing(null)} />}
      {editing && (
        <EditCredentialDialog
          credential={editing}
          onClose={() => setEditing(null)}
          onSave={async (data) => {
            await updateItem(editing.id, data);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function ViewCredentialDialog({
  credential,
  onClose,
}: {
  credential: Credential;
  onClose: () => void;
}) {
  const [revealed, setRevealed] = useState(false);
  const [revealedConfig, setRevealedConfig] = useState<Record<string, unknown> | null>(null);
  const [loadingReveal, setLoadingReveal] = useState(false);
  const [revealError, setRevealError] = useState<string | null>(null);

  const maskedJson = maskedConfigJson((credential.config as Record<string, unknown>) ?? {});
  const configJson =
    revealed && revealedConfig ? JSON.stringify(revealedConfig, null, 2) : maskedJson;
  const hasConfig = Object.keys((credential.config as Record<string, unknown>) ?? {}).length > 0;

  const toggleReveal = async () => {
    if (revealed) {
      setRevealed(false);
      return;
    }
    setRevealError(null);
    if (revealedConfig) {
      setRevealed(true);
      return;
    }
    setLoadingReveal(true);
    try {
      const full = (await credentialsApi.reveal(credential.id)) as unknown as Credential;
      setRevealedConfig((full.config as Record<string, unknown>) ?? {});
      setRevealed(true);
    } catch (err) {
      setRevealError(getErrorMessage(err, 'Failed to reveal'));
    } finally {
      setLoadingReveal(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Identity Details</DialogTitle>
          <DialogDescription>{credential.name}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Auth Type
              </div>
              <div>{authTypeLabel(credential.authType)}</div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Status
              </div>
              <StatusBadge status={credential.status} />
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Expires At
              </div>
              <div>
                {credential.expiresAt
                  ? new Date(credential.expiresAt).toLocaleDateString()
                  : '—'}
              </div>
            </div>
          </div>

          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label>Config (JSON)</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={toggleReveal}
                disabled={loadingReveal || !hasConfig}
              >
                {revealed ? (
                  <><EyeOff className="mr-1 h-4 w-4" /> Hide</>
                ) : (
                  <><Eye className="mr-1 h-4 w-4" /> {loadingReveal ? 'Revealing…' : 'Show'}</>
                )}
              </Button>
            </div>
            <Textarea
              readOnly
              value={hasConfig ? configJson : '{}'}
              rows={8}
              className="font-mono text-xs"
            />
            {revealError && <p className="text-sm text-destructive">{revealError}</p>}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditCredentialDialog({
  credential,
  onClose,
  onSave,
}: {
  credential: Credential;
  onClose: () => void;
  onSave: (data: Partial<Credential>) => Promise<void>;
}) {
  const [name, setName] = useState(credential.name);
  const [authType, setAuthType] = useState<AuthType>(credential.authType);
  const [status, setStatus] = useState<'active' | 'inactive'>(
    credential.status === 'inactive' ? 'inactive' : 'active',
  );
  const [expiresAt, setExpiresAt] = useState(isoToDateInput(credential.expiresAt));
  const [reveal, setReveal] = useState(false);
  const [plainConfig, setPlainConfig] = useState<Record<string, unknown>>({});
  const [configText, setConfigText] = useState('');
  const [loadingCfg, setLoadingCfg] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load the real (unmasked) config so edits don't overwrite keys with masks.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const full = (await credentialsApi.reveal(credential.id)) as unknown as Credential;
        if (cancelled) return;
        setPlainConfig((full.config as Record<string, unknown>) ?? {});
      } catch (err) {
        if (!cancelled) setError(getErrorMessage(err, 'Failed to load config'));
      } finally {
        if (!cancelled) setLoadingCfg(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [credential.id]);

  // When revealed, the textarea is editable plaintext JSON. When hidden, it
  // shows masked JSON and is read-only (editing requires revealing first).
  const displayedText = reveal ? configText : maskedConfigJson(plainConfig);

  const toggleReveal = () => {
    if (!reveal) {
      // Entering reveal/edit mode: seed the editable text from the real config.
      setConfigText(JSON.stringify(plainConfig, null, 2));
    }
    setReveal((r) => !r);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setError(null);

    // Use edited text if the user revealed+edited; otherwise keep existing config.
    let config: Record<string, unknown> = plainConfig;
    if (reveal) {
      try {
        config = configText.trim() ? JSON.parse(configText) : {};
      } catch {
        setError('Config must be valid JSON');
        return;
      }
    }

    setSaving(true);
    try {
      await onSave({
        name,
        authType,
        config,
        status,
        expiresAt: dateInputToIso(expiresAt),
      } as Partial<Credential>);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to save'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={handleSave}>
          <DialogHeader>
            <DialogTitle>Edit Identity</DialogTitle>
            <DialogDescription>{credential.name}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-name">Name *</Label>
              <Input id="edit-name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-auth-type">Auth Type</Label>
              <select
                id="edit-auth-type"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={authType}
                onChange={(e) => setAuthType(e.target.value as AuthType)}
              >
                {authTypes.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-status">Status</Label>
                <select
                  id="edit-status"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as 'active' | 'inactive')}
                >
                  {statusOptions.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-expires">Expires At</Label>
                <Input
                  id="edit-expires"
                  type="date"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="edit-config">Config (JSON)</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={toggleReveal}
                  disabled={loadingCfg}
                >
                  {reveal ? (
                    <><EyeOff className="mr-1 h-4 w-4" /> Hide</>
                  ) : (
                    <><Eye className="mr-1 h-4 w-4" /> Show & edit</>
                  )}
                </Button>
              </div>
              <Textarea
                id="edit-config"
                value={loadingCfg ? 'Loading…' : displayedText}
                onChange={(e) => setConfigText(e.target.value)}
                readOnly={!reveal || loadingCfg}
                rows={8}
                className="font-mono text-xs"
              />
              {!reveal && !loadingCfg && (
                <p className="text-xs text-muted-foreground">
                  Click “Show &amp; edit” to reveal and modify the config.
                </p>
              )}
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || loadingCfg || !name.trim()}>
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
