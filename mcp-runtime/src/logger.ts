import pino from 'pino';

export const logger = pino({
  name: 'mcp-runtime',
  level: process.env.LOG_LEVEL ?? 'info',
  redact: ['headers.Authorization', 'headers["X-API-Key"]', 'headers["apiKey"]'],
});
