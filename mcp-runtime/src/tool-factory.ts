import { request } from 'undici';
import type { ToolConfig, AuthEnv } from './types.js';
import { buildRequest } from './upstream-client.js';
import { injectAuth } from './auth-injector.js';
import { logger } from './logger.js';
import { toolInvocations, toolDuration, upstreamErrors } from './metrics.js';

export interface McpToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: true;
}

export type ToolHandler = (args: Record<string, unknown>) => Promise<McpToolResult>;

export function buildToolHandler(
  upstreamBaseUrl: string,
  tool: ToolConfig,
  authEnv: AuthEnv,
): ToolHandler {
  return async (args) => {
    const end = toolDuration.startTimer({ tool: tool.toolName });
    try {
      const prepared = buildRequest(upstreamBaseUrl, tool, args);
      const withAuth = injectAuth(
        { url: prepared.url, headers: prepared.headers },
        authEnv,
      );
      const res = await request(withAuth.url.toString(), {
        method: prepared.method as any,
        headers: withAuth.headers,
        body: prepared.body,
      });
      const text = await res.body.text();
      const isError = res.statusCode >= 400;
      if (isError) {
        upstreamErrors.inc({ tool: tool.toolName, status: String(res.statusCode) });
      }
      toolInvocations.inc({ tool: tool.toolName, outcome: isError ? 'error' : 'ok' });
      logger.info(
        { tool: tool.toolName, status: res.statusCode, url: withAuth.url.toString() },
        'tool_invocation',
      );
      return {
        content: [{ type: 'text', text }],
        ...(isError ? { isError: true as const } : {}),
      };
    } catch (err) {
      toolInvocations.inc({ tool: tool.toolName, outcome: 'exception' });
      logger.error({ tool: tool.toolName, err }, 'tool_invocation_failed');
      return {
        content: [{ type: 'text', text: `Error: ${(err as Error).message}` }],
        isError: true,
      };
    } finally {
      end();
    }
  };
}
