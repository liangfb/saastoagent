import * as yaml from 'js-yaml';
import { PrismaService } from '../../../core/prisma/prisma.service';
import type { ToolManifest, CredentialSecretData } from './manifest-builder';

/**
 * Parse a raw Swagger/OpenAPI document that may be JSON or YAML.
 * Throws if neither parses into an object.
 */
export function parseSpecContent(content: string): any {
  const trimmed = content.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // Fall through to YAML (YAML is a JSON superset, so this also covers JSON).
  }
  const doc = yaml.load(trimmed);
  if (!doc || typeof doc !== 'object') {
    throw new Error('Spec content is not valid JSON or YAML');
  }
  return doc;
}

export const DEFAULT_NAMESPACE = 'agentic-mesh';
// Placeholder fallback only — real deployments set MCP_RUNTIME_IMAGE (see
// infra/k8s/01-configmap.yaml). The ACCOUNT_ID/region must be substituted.
export const DEFAULT_MCP_RUNTIME_IMAGE =
  'ACCOUNT_ID.dkr.ecr.us-west-2.amazonaws.com/agentic-mesh-dev-mcp-runtime:latest';

export function k8sNamespace(): string {
  return process.env.K8S_NAMESPACE ?? DEFAULT_NAMESPACE;
}

export function mcpRuntimeImage(): string {
  return process.env.MCP_RUNTIME_IMAGE ?? DEFAULT_MCP_RUNTIME_IMAGE;
}

export function extractUpstreamBaseUrl(sourceUrl: string | null | undefined): string | null {
  if (!sourceUrl) return null;
  try {
    const u = new URL(sourceUrl);
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

/**
 * Derive the upstream base URL the Agent should call from the spec document
 * itself: OpenAPI 3 `servers[0].url`, or Swagger 2 `schemes/host/basePath`.
 * A relative OpenAPI-3 server url is resolved against `sourceUrl` when present.
 */
export function baseUrlFromSpec(
  spec: any,
  sourceUrl?: string | null,
): string | null {
  if (!spec || typeof spec !== 'object') return null;

  // OpenAPI 3.x
  const server = Array.isArray(spec.servers) ? spec.servers[0] : null;
  if (server?.url) {
    const url: string = String(server.url);
    try {
      // Absolute url → take origin (+ any base path segment).
      const abs = new URL(url);
      return `${abs.protocol}//${abs.host}${abs.pathname === '/' ? '' : abs.pathname.replace(/\/$/, '')}`;
    } catch {
      // Relative url → resolve against sourceUrl origin if we have one.
      const origin = extractUpstreamBaseUrl(sourceUrl);
      if (origin) return `${origin}${url.startsWith('/') ? '' : '/'}${url.replace(/\/$/, '')}`;
      return null;
    }
  }

  // Swagger 2.0
  if (spec.host) {
    const scheme = Array.isArray(spec.schemes) && spec.schemes.length ? spec.schemes[0] : 'https';
    const basePath = spec.basePath && spec.basePath !== '/' ? spec.basePath.replace(/\/$/, '') : '';
    return `${scheme}://${spec.host}${basePath}`;
  }

  return null;
}

export function buildInputSchema(
  parameters: Array<{
    name: string;
    dataType?: string | null;
    originalDescription?: string | null;
    schemaDetail?: unknown;
    required?: boolean;
  }>,
  requestSchema: unknown,
): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const p of parameters) {
    properties[p.name] = {
      type: p.dataType || 'string',
      description: p.originalDescription ?? undefined,
      ...(p.schemaDetail && typeof p.schemaDetail === 'object' ? p.schemaDetail : {}),
    };
    if (p.required) required.push(p.name);
  }

  if (requestSchema && typeof requestSchema === 'object') {
    properties.body = requestSchema;
    required.push('body');
  }

  return {
    type: 'object',
    properties,
    required,
  };
}

export function buildParameterMapping(
  parameters: Array<{ name: string; location: string }>,
  requestSchema: unknown,
): ToolManifest['parameterMapping'] {
  const mapping: ToolManifest['parameterMapping'] = {
    path: [],
    query: [],
    header: [],
    body: null,
  };
  for (const p of parameters) {
    if (p.location === 'path') mapping.path.push(p.name);
    else if (p.location === 'query') mapping.query.push(p.name);
    else if (p.location === 'header') mapping.header.push(p.name);
  }
  if (requestSchema) mapping.body = 'body';
  return mapping;
}

/**
 * Load a credential record and translate it into the env-var bundle that
 * mcp-runtime expects. Returns null when there's no credential or the record
 * is missing/uses an unsupported auth type.
 */
export async function loadCredentialSecret(
  prisma: PrismaService,
  credentialId: string | null | undefined,
): Promise<CredentialSecretData | null> {
  if (!credentialId) return null;
  const cred = await prisma.credential.findUnique({ where: { id: credentialId } });
  if (!cred) return null;
  const cfg = (cred.config ?? {}) as Record<string, string>;
  if (cred.authType === 'api_key') {
    return {
      authType: 'api_key',
      data: {
        API_KEY_NAME: cfg.key_name ?? '',
        API_KEY_VALUE: cfg.key_value ?? '',
        API_KEY_LOCATION: cfg.key_location ?? 'header',
      },
    };
  }
  if (cred.authType === 'bearer_token') {
    return { authType: 'bearer_token', data: { BEARER_TOKEN: cfg.token ?? '' } };
  }
  if (cred.authType === 'oauth2') {
    return {
      authType: 'oauth2',
      data: {
        OAUTH_ACCESS_TOKEN: cfg.access_token ?? '',
        OAUTH_REFRESH_TOKEN: cfg.refresh_token ?? '',
        OAUTH_EXPIRES_AT: cfg.expires_at ?? '',
      },
    };
  }
  return null;
}
