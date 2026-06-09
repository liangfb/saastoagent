import Fastify from 'fastify';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { loadConfig } from './config-loader.js';
import { buildToolHandler } from './tool-factory.js';
import { logger } from './logger.js';
import { registry } from './metrics.js';
import { jsonSchemaToZodShape } from './json-schema-to-zod.js';
import type { AuthEnv } from './types.js';

const CONFIG_PATH = process.env.MCP_CONFIG_PATH ?? '/etc/mcp/config.json';
const PORT = Number(process.env.PORT ?? 8080);

async function start() {
  const config = loadConfig(CONFIG_PATH);
  const authEnv: AuthEnv = {
    API_KEY_NAME: process.env.API_KEY_NAME,
    API_KEY_VALUE: process.env.API_KEY_VALUE,
    API_KEY_LOCATION: process.env.API_KEY_LOCATION as 'header' | 'query' | undefined,
    BEARER_TOKEN: process.env.BEARER_TOKEN,
    OAUTH_ACCESS_TOKEN: process.env.OAUTH_ACCESS_TOKEN,
  };

  // Build a fresh McpServer with all tool registrations. Used stateless per-request.
  function buildMcpServer(): McpServer {
    const mcp = new McpServer({ name: config.serverName, version: '1.0.0' });
    for (const tool of config.tools) {
      const handler = buildToolHandler(config.upstreamBaseUrl, tool, authEnv);
      const shape = jsonSchemaToZodShape(tool.inputSchema);
      (mcp.tool as any)(
        tool.toolName,
        tool.description,
        shape,
        async (args: any, _extra: any) => handler(args as Record<string, unknown>),
      );
    }
    return mcp;
  }

  const app = Fastify({ logger: false });

  // Stateless Streamable HTTP: fresh McpServer + transport per request so concurrent
  // clients don't collide on "Server already initialized".
  async function handleMcp(req: any, reply: any, body: unknown) {
    const mcp = buildMcpServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    reply.raw.on('close', () => {
      try { transport.close(); } catch { /* noop */ }
      try { mcp.close(); } catch { /* noop */ }
    });
    await mcp.connect(transport);
    await transport.handleRequest(req.raw, reply.raw, body);
  }

  app.post('/mcp', async (req, reply) => {
    await handleMcp(req, reply, req.body);
  });
  app.get('/mcp', async (req, reply) => {
    await handleMcp(req, reply, undefined);
  });
  app.delete('/mcp', async (req, reply) => {
    await handleMcp(req, reply, undefined);
  });

  app.get('/healthz', async () => ({ status: 'ok' }));
  app.get('/readyz', async () => ({ status: 'ready', tools: config.tools.length }));
  app.get('/metrics', async (_req, reply) => {
    reply.header('Content-Type', registry.contentType);
    return registry.metrics();
  });

  await app.listen({ port: PORT, host: '0.0.0.0' });
  logger.info({ port: PORT, serverName: config.serverName, toolCount: config.tools.length }, 'mcp_runtime_started');
}

start().catch((err) => {
  logger.error({ err }, 'startup_failed');
  process.exit(1);
});
