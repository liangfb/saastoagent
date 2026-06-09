import { readFileSync } from 'node:fs';
import { z } from 'zod';
import type { McpRuntimeConfig } from './types.js';

const schema = z.object({
  serverId: z.string().uuid(),
  serverName: z.string().min(1),
  upstreamBaseUrl: z.string().url(),
  tools: z.array(
    z.object({
      toolName: z.string().min(1),
      description: z.string(),
      method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
      path: z.string().min(1),
      inputSchema: z.record(z.unknown()),
      outputSchema: z.record(z.unknown()).nullable(),
      parameterMapping: z.object({
        path: z.array(z.string()),
        query: z.array(z.string()),
        header: z.array(z.string()),
        body: z.string().nullable(),
      }),
    }),
  ),
});

export function loadConfig(path: string): McpRuntimeConfig {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf-8');
  } catch (err) {
    throw new Error(`Failed to read config at ${path}: ${(err as Error).message}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Invalid config JSON: ${(err as Error).message}`);
  }
  return schema.parse(parsed);
}
