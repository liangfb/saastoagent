import { z } from 'zod';

export const appConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(8000),

  // CORS: comma-separated allowlist of origins. Empty (default) = allow ALL
  // origins. Set to your frontend origin(s) to lock it down in production.
  CORS_ORIGINS: z.string().default(''),

  // Database
  DATABASE_URL: z.string().url(),

  // Redis
  REDIS_URL: z.string().default('redis://localhost:6379/0'),

  // JWT
  JWT_SECRET_KEY: z.string().min(8),

  // Langfuse (cloud or self-hosted). LANGFUSE_BASE_URL is preferred;
  // LANGFUSE_HOST is kept as a fallback for backward compatibility.
  LANGFUSE_BASE_URL: z.string().url().optional(),
  LANGFUSE_HOST: z.string().url().optional(),
  LANGFUSE_PUBLIC_KEY: z.string().optional(),
  LANGFUSE_SECRET_KEY: z.string().optional(),

  // LLM API Keys
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  GOOGLE_API_KEY: z.string().optional(),

  // AWS Bedrock
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_REGION: z.string().default('us-east-1'),
});

export type AppConfig = z.infer<typeof appConfigSchema>;
