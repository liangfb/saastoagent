import { z } from 'zod';

export const createLlmConfigSchema = z.object({
  name: z.string().min(1).max(255),
  provider: z.enum(['openai', 'anthropic', 'google', 'bedrock']),
  modelId: z.string().min(1).max(100),
  apiEndpoint: z.string().url().nullish(),
  credentials: z.record(z.unknown()).default({}),
  region: z.string().max(50).nullish(),
  defaultParams: z.record(z.unknown()).default({}),
  isActive: z.boolean().default(true),
});

export type CreateLlmConfigDto = z.infer<typeof createLlmConfigSchema>;

export const updateLlmConfigSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  provider: z.enum(['openai', 'anthropic', 'google', 'bedrock']).optional(),
  modelId: z.string().min(1).max(100).optional(),
  apiEndpoint: z.string().url().nullish(),
  credentials: z.record(z.unknown()).optional(),
  region: z.string().max(50).nullish(),
  defaultParams: z.record(z.unknown()).optional(),
  isActive: z.boolean().optional(),
});

export type UpdateLlmConfigDto = z.infer<typeof updateLlmConfigSchema>;

export const updateAssignmentsSchema = z.object({
  assignments: z.array(
    z.object({
      usageType: z.enum(['semantic_enhancement', 'agent_reasoning', 'intent_classification']),
      llmConfigId: z.string().uuid(),
      fallbackLlmConfigId: z.string().uuid().nullish(),
    }),
  ),
});

export type UpdateAssignmentsDto = z.infer<typeof updateAssignmentsSchema>;
