import { z } from 'zod';

// agentType is retained in the Prisma schema for backward compatibility with
// pre-existing rows but the runtime no longer branches on it. New agents
// default to 'specialist'; legacy 'router' rows behave identically.
export const createAgentSchema = z.object({
  name: z.string().min(1).max(255),
  agentType: z.enum(['router', 'specialist']).optional().default('specialist'),
  description: z.string().nullish(),
  systemPrompt: z.string().nullish(),
  llmConfigId: z.string().uuid().nullish(),
  isActive: z.boolean().optional().default(true),
});

export type CreateAgentDto = z.infer<typeof createAgentSchema>;

export const updateAgentSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  agentType: z.enum(['router', 'specialist']).optional(),
  description: z.string().nullish(),
  systemPrompt: z.string().nullish(),
  llmConfigId: z.string().uuid().nullish(),
  isActive: z.boolean().optional(),
});

export type UpdateAgentDto = z.infer<typeof updateAgentSchema>;

export const bindMcpSchema = z.object({
  mcpToolId: z.string().uuid(),
});

export type BindMcpDto = z.infer<typeof bindMcpSchema>;

/** Replace the full set of MCP tools bound to an agent. */
export const setMcpBindingsSchema = z.object({
  mcpToolIds: z.array(z.string().uuid()),
});

export type SetMcpBindingsDto = z.infer<typeof setMcpBindingsSchema>;
