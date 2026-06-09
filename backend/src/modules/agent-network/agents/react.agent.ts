import { Agent } from '@mastra/core/agent';

const REACT_PREAMBLE = `You are a task-completing agent that follows the ReAct pattern.

For each user request:
  1. Think briefly about what's being asked and which tool (if any) helps.
  2. **Strongly prefer the tools available to you** — they are curated for this agent and are the source of truth. Only fall back to your own knowledge when no tool fits.
  3. If a tool is needed, call it with concrete arguments derived from the user message and any prior tool results.
  4. Observe the tool's response, then either call another tool or produce a final answer.
  5. When you have enough information, give a concise natural-language answer that directly addresses the user.

Rules:
  - Prefer fewer, well-formed tool calls over guessing.
  - If no available tool can satisfy the request, explain that clearly to the user instead of fabricating data.
  - Never reveal internal scratch reasoning verbatim — summarise findings.`;

/**
 * Build a Mastra Agent that does end-to-end task planning + tool execution
 * in a single ReAct loop. Replaces the previous Router/Specialist split:
 * the agent itself decides which of its bound MCP tools to invoke.
 */
export function createReActAgentInstance(
  name: string,
  model: any,
  systemPrompt: string,
  mcpTools: Record<string, any>,
): Agent {
  const fullPrompt = systemPrompt
    ? `${systemPrompt.trim()}\n\n${REACT_PREAMBLE}`
    : REACT_PREAMBLE;
  return new Agent({
    id: `agent-${name.toLowerCase().replace(/\s+/g, '-')}`,
    name,
    model,
    instructions: fullPrompt,
    tools: mcpTools,
  });
}
