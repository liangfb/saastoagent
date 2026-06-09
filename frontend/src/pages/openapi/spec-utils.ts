import type { SpecPreview } from '@/api/openapi-sources';

/**
 * Validate a pasted spec into a SpecPreview. JSON is parsed locally for a rich
 * preview; YAML can't be parsed here (no YAML lib in the frontend), so we do a
 * light structural sniff and let the backend validate authoritatively.
 */
interface SpecDoc {
  openapi?: string;
  swagger?: string;
  host?: string;
  basePath?: string;
  schemes?: string[];
  servers?: Array<{ url?: string }>;
  info?: { title?: string; description?: string };
  paths?: Record<string, unknown>;
  [key: string]: unknown;
}

export function parseSpecLocally(content: string): SpecPreview {
  const trimmed = content.trim();
  let parsed: SpecDoc | null = null;
  try {
    parsed = JSON.parse(trimmed) as SpecDoc;
  } catch {
    if (!/^\s*(openapi|swagger)\s*:/m.test(trimmed)) {
      throw new Error(
        'Content is not valid JSON, and does not look like an OpenAPI/Swagger YAML document',
      );
    }
    const versionMatch = trimmed.match(/^\s*(?:openapi|swagger)\s*:\s*["']?([\d.]+)["']?/m);
    const titleMatch = trimmed.match(/^\s*title\s*:\s*["']?(.+?)["']?\s*$/m);
    return {
      contentType: 'manual-yaml',
      specVersion: versionMatch?.[1] ?? null,
      title: titleMatch?.[1] ?? null,
      description: null,
      pathCount: null,
      raw: trimmed,
      parsed: null,
    };
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Content is not a valid OpenAPI/Swagger document');
  }
  if (!parsed.openapi && !parsed.swagger) {
    throw new Error('Missing "openapi" or "swagger" version field — not an OpenAPI/Swagger document');
  }
  return {
    contentType: 'manual',
    specVersion: parsed.openapi ?? parsed.swagger ?? null,
    title: parsed.info?.title ?? null,
    description: parsed.info?.description ?? null,
    pathCount: parsed.paths ? Object.keys(parsed.paths).length : null,
    raw: trimmed,
    parsed,
  };
}

/** Derive the runtime base URL from a parsed spec's servers[]/host. */
export function deriveBaseUrl(parsedInput: unknown): string {
  const parsed = (parsedInput ?? {}) as SpecDoc;
  const server = Array.isArray(parsed.servers) ? parsed.servers[0] : null;
  if (server?.url) {
    try {
      const u = new URL(server.url);
      return `${u.protocol}//${u.host}${u.pathname === '/' ? '' : u.pathname.replace(/\/$/, '')}`;
    } catch {
      return '';
    }
  }
  if (parsed?.host) {
    const scheme = Array.isArray(parsed.schemes) && parsed.schemes.length ? parsed.schemes[0] : 'https';
    const basePath = parsed.basePath && parsed.basePath !== '/' ? parsed.basePath.replace(/\/$/, '') : '';
    return `${scheme}://${parsed.host}${basePath}`;
  }
  return '';
}
