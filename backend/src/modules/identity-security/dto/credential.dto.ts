import { z } from 'zod';

export const createCredentialSchema = z.object({
  name: z.string().min(1).max(255),
  authType: z.enum(['api_key', 'oauth2', 'bearer_token']),
  config: z.record(z.unknown()).default({}),
  status: z.enum(['active', 'inactive']).default('active'),
  expiresAt: z.string().datetime().nullish(),
});

export type CreateCredentialDto = z.infer<typeof createCredentialSchema>;

export const updateCredentialSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  authType: z.enum(['api_key', 'oauth2', 'bearer_token']).optional(),
  config: z.record(z.unknown()).optional(),
  status: z.enum(['active', 'inactive']).optional(),
  expiresAt: z.string().datetime().nullish(),
});

export type UpdateCredentialDto = z.infer<typeof updateCredentialSchema>;
