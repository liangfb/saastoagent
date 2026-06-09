import { z } from 'zod';

export const createOpenapiSourceSchema = z
  .object({
    name: z.string().min(1).max(255),
    sourceType: z.enum(['url', 'file', 'manual']).default('url'),
    sourceUrl: z.string().url().nullish(),
    // Manual mode: raw Swagger/OpenAPI document pasted as JSON or YAML.
    specContent: z.string().min(1).nullish(),
    // Runtime base URL the Agent calls. Required for manual specs that have no
    // sourceUrl and no servers[]; otherwise derived from the spec or sourceUrl.
    baseUrl: z.string().url().nullish(),
    businessDescription: z.string().nullish(),
    sopDocument: z.string().nullish(),
    credentialId: z.string().uuid().nullish(),
  })
  .refine((d) => d.sourceType !== 'manual' || !!d.specContent, {
    message: 'specContent is required when sourceType is "manual"',
    path: ['specContent'],
  });

export type CreateOpenapiSourceDto = z.infer<typeof createOpenapiSourceSchema>;

export const updateOpenapiSourceSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  sourceType: z.enum(['url', 'file', 'manual']).optional(),
  sourceUrl: z.string().url().nullish(),
  specContent: z.string().min(1).nullish(),
  baseUrl: z.string().url().nullish(),
  businessDescription: z.string().nullish(),
  sopDocument: z.string().nullish(),
  credentialId: z.string().uuid().nullish(),
});

export type UpdateOpenapiSourceDto = z.infer<typeof updateOpenapiSourceSchema>;
