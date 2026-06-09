export const LABEL_MCP_SERVER_ID = 'agentic-mesh/mcp-server-id';
export const LABEL_OPENAPI_SOURCE_ID = 'agentic-mesh/openapi-source-id';
export const LABEL_MANAGED_BY = 'agentic-mesh/managed-by';
export const LABEL_APP_NAME = 'app.kubernetes.io/name';

export const MANAGED_BY_VALUE = 'mcp-generate';
export const APP_NAME_VALUE = 'mcp-runtime';

export function mcpServerLabels(params: {
  mcpServerId: string;
  openapiSourceId: string;
}): Record<string, string> {
  return {
    [LABEL_MCP_SERVER_ID]: params.mcpServerId,
    [LABEL_OPENAPI_SOURCE_ID]: params.openapiSourceId,
    [LABEL_MANAGED_BY]: MANAGED_BY_VALUE,
    [LABEL_APP_NAME]: APP_NAME_VALUE,
  };
}

export function mcpServerSelector(mcpServerId: string): string {
  return `${LABEL_MCP_SERVER_ID}=${mcpServerId}`;
}
