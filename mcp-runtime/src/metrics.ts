import { Counter, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

export const registry = new Registry();
collectDefaultMetrics({ register: registry });

export const toolInvocations = new Counter({
  name: 'mcp_tool_invocations_total',
  help: 'Count of MCP tool invocations by tool and outcome',
  labelNames: ['tool', 'outcome'] as const,
  registers: [registry],
});

export const toolDuration = new Histogram({
  name: 'mcp_tool_duration_seconds',
  help: 'Tool invocation duration in seconds',
  labelNames: ['tool'] as const,
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],
  registers: [registry],
});

export const upstreamErrors = new Counter({
  name: 'upstream_errors_total',
  help: 'Count of upstream API errors (status >= 400)',
  labelNames: ['tool', 'status'] as const,
  registers: [registry],
});
