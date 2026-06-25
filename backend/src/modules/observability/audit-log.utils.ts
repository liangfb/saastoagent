import { createHash } from 'node:crypto';

const SENSITIVE_KEYS = new Set([
  'password',
  'passcode',
  'token',
  'accesstoken',
  'refreshtoken',
  'secret',
  'apikey',
  'keyvalue',
  'authorization',
  'cookie',
  'credential',
  'clientsecret',
]);

const MAX_DEPTH = 6;
const MAX_ARRAY_ITEMS = 20;
const MAX_STRING_LENGTH = 512;
const MAX_PREVIEW_BYTES = 4096;

type JsonLike =
  | string
  | number
  | boolean
  | null
  | JsonLike[]
  | { [key: string]: JsonLike };

export function sanitizeForAudit(value: unknown): JsonLike {
  return truncatePreview(sanitizeValue(value, 0, undefined));
}

export function hashForAudit(value: unknown): string {
  return createHash('sha256').update(stableStringify(toJsonSafe(value))).digest('hex');
}

function sanitizeValue(value: unknown, depth: number, key: string | undefined): JsonLike {
  if (key && isSensitiveKey(key)) return '****';
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return truncateString(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (depth >= MAX_DEPTH) return '[MaxDepth]';

  if (Array.isArray(value)) {
    const items = value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item) => sanitizeValue(item, depth + 1, undefined));
    if (value.length > MAX_ARRAY_ITEMS) items.push(`[Truncated ${value.length - MAX_ARRAY_ITEMS} items]`);
    return items;
  }

  if (typeof value === 'object') {
    const out: Record<string, JsonLike> = {};
    for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
      out[childKey] = sanitizeValue(childValue, depth + 1, childKey);
    }
    return out;
  }

  return String(value);
}

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEYS.has(key.toLowerCase().replace(/[^a-z0-9]/g, ''));
}

function truncatePreview(value: JsonLike): JsonLike {
  const serialized = JSON.stringify(value);
  if (Buffer.byteLength(serialized, 'utf8') <= MAX_PREVIEW_BYTES) return value;
  return {
    truncated: true,
    preview: serialized.slice(0, MAX_PREVIEW_BYTES),
  };
}

function truncateString(value: string): string {
  if (value.length <= MAX_STRING_LENGTH) return value;
  return `${value.slice(0, MAX_STRING_LENGTH)}...`;
}

function toJsonSafe(value: unknown): unknown {
  if (value === undefined) return null;
  if (value === null) return null;
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(toJsonSafe);
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      out[key] = toJsonSafe(child);
    }
    return out;
  }
  return value;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`)
    .join(',')}}`;
}
