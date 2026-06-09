import { z } from 'zod';

export const createSessionSchema = z.object({
  title: z.string().max(500).nullish(),
  agentId: z.string().uuid().nullish(),
});

export type CreateSessionDto = z.infer<typeof createSessionSchema> & {
  // Injected by the controller from the authenticated JWT, never the client.
  userId?: string;
};
