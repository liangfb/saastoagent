import { Mastra } from '@mastra/core';

/**
 * Default Mastra instance for utilities (logging, telemetry).
 * Agents themselves are constructed per request via react.agent.ts factory.
 */
export function createMastraInstance(): Mastra {
  return new Mastra({});
}
