import { z } from 'zod';

export const loginSchema = z.object({
  username: z.string().min(1).max(255),
  password: z.string().min(1).max(255),
});

export type LoginDto = z.infer<typeof loginSchema>;
