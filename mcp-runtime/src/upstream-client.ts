import type { ToolConfig } from './types.js';

export interface BuiltRequest {
  method: string;
  url: URL;
  headers: Record<string, string>;
  body: string | undefined;
}

export function buildRequest(
  upstreamBaseUrl: string,
  tool: ToolConfig,
  args: Record<string, unknown>,
): BuiltRequest {
  let path = tool.path;
  for (const name of tool.parameterMapping.path) {
    const value = args[name];
    if (value === undefined) {
      throw new Error(`Missing required path parameter: ${name}`);
    }
    path = path.replaceAll(`{${name}}`, encodeURIComponent(String(value)));
  }

  const url = new URL(path, upstreamBaseUrl.endsWith('/') ? upstreamBaseUrl : upstreamBaseUrl + '/');

  for (const name of tool.parameterMapping.query) {
    const value = args[name];
    if (value === undefined || value === null) continue;
    url.searchParams.set(name, String(value));
  }

  const headers: Record<string, string> = {};
  for (const name of tool.parameterMapping.header) {
    const value = args[name];
    if (value === undefined || value === null) continue;
    headers[name] = String(value);
  }

  let body: string | undefined;
  const methodAllowsBody = tool.method !== 'GET' && tool.method !== 'DELETE';
  if (methodAllowsBody && tool.parameterMapping.body) {
    const raw = args[tool.parameterMapping.body];
    if (raw !== undefined && raw !== null) {
      body = JSON.stringify(raw);
      headers['Content-Type'] = 'application/json';
    }
  }

  return { method: tool.method, url, headers, body };
}
