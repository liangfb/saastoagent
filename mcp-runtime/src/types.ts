export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface ParameterMapping {
  path: string[];
  query: string[];
  header: string[];
  body: string | null;
}

export interface ToolConfig {
  toolName: string;
  description: string;
  method: HttpMethod;
  path: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown> | null;
  parameterMapping: ParameterMapping;
}

export interface McpRuntimeConfig {
  serverId: string;
  serverName: string;
  upstreamBaseUrl: string;
  tools: ToolConfig[];
}

export interface AuthEnv {
  API_KEY_NAME?: string;
  API_KEY_VALUE?: string;
  API_KEY_LOCATION?: 'header' | 'query';
  BEARER_TOKEN?: string;
  OAUTH_ACCESS_TOKEN?: string;
}
