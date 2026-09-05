import { z } from 'zod';

export const updateMcpToolEnabledSchema = z.object({
  tools: z
    .array(
      z.object({
        id: z.string().uuid(),
        enabledInMcp: z.boolean(),
      }),
    )
    .min(1),
  apply: z.boolean().optional().default(true),
});

export type UpdateMcpToolEnabledDto = z.infer<typeof updateMcpToolEnabledSchema>;
