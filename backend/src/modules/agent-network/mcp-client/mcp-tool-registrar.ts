import { Injectable } from '@nestjs/common';
import { createTool } from '@mastra/core/tools';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { jsonSchemaToZod } from './json-schema-to-zod';

export interface RegistrarToolDef {
  mcpServerId: string;
  mcpToolId?: string;
  toolName: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ToolExecutionHooks {
  onBefore?: (call: { toolName: string; args: unknown }) => Promise<void> | void;
  onSuccess?: (result: {
    toolName: string;
    args: unknown;
    result: unknown;
    durationMs: number;
  }) => Promise<void> | void;
  onError?: (err: {
    toolName: string;
    args: unknown;
    error: Error;
    durationMs: number;
  }) => Promise<void> | void;
}

@Injectable()
export class McpToolRegistrar {
  toMastraTool(client: Client, def: RegistrarToolDef, hooks: ToolExecutionHooks = {}) {
    // Derive a real Zod schema from the tool's JSON Schema (instead of
    // z.record(z.unknown())). This makes the LLM see the actual parameter
    // contract, and Mastra validates the model's arguments against it before
    // execute() runs — invalid calls get a structured error the Agent can fix,
    // and the downstream API is never hit with bad args.
    const inputSchema = jsonSchemaToZod(def.inputSchema);

    return createTool({
      id: def.toolName,
      description: def.description,
      inputSchema,
      execute: async ({ context }) => {
        const args = (context ?? {}) as Record<string, unknown>;
        const start = Date.now();
        try {
          await hooks.onBefore?.({ toolName: def.toolName, args });
          const res = await client.callTool({ name: def.toolName, arguments: args });
          const durationMs = Date.now() - start;
          await hooks.onSuccess?.({ toolName: def.toolName, args, result: res, durationMs });
          return res;
        } catch (err) {
          const durationMs = Date.now() - start;
          await hooks.onError?.({
            toolName: def.toolName,
            args,
            error: err as Error,
            durationMs,
          });
          throw err;
        }
      },
    });
  }
}
