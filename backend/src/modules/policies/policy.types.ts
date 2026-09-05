import { ForbiddenException } from '@nestjs/common';

export const POLICY_PHASES = ['pre_tool', 'post_tool'] as const;
export const POLICY_EFFECTS = ['allow', 'deny'] as const;
export const POLICY_OPERATORS = [
  'eq',
  'neq',
  'in',
  'not_in',
  'exists',
  'gt',
  'gte',
  'lt',
  'lte',
  'contains',
] as const;

export type PolicyPhase = (typeof POLICY_PHASES)[number];
export type PolicyEffect = (typeof POLICY_EFFECTS)[number];
export type PolicyOperator = (typeof POLICY_OPERATORS)[number];

export interface PolicyScope {
  agentIds?: string[];
  mcpServerIds?: string[];
  mcpToolIds?: string[];
  toolNames?: string[];
}

export interface PolicyConditionLeaf {
  field: string;
  op: PolicyOperator;
  value?: unknown;
}

export type PolicyCondition =
  | PolicyConditionLeaf
  | { all: PolicyCondition[] }
  | { any: PolicyCondition[] }
  | { not: PolicyCondition };

export interface PolicyRule {
  id: string;
  phase: PolicyPhase;
  effect: PolicyEffect;
  when: PolicyCondition;
  reason: string;
}

export interface PolicyFacts {
  user: { id: string };
  agent: { id: string };
  session: { id: string };
  context: { id: string; traceId: string };
  tool: { id: string; name: string; mcpServerId: string };
  args: unknown;
  result?: unknown;
  outcome?: { status: 'succeeded'; durationMs: number };
}

export interface PolicyEvaluationInput {
  phase: PolicyPhase;
  facts: PolicyFacts;
}

export interface PolicyEvaluationResult {
  effect: PolicyEffect;
  phase: PolicyPhase;
  matchedPolicyIds: string[];
  matchedPolicyVersions: Array<{ id: string; version: number }>;
  matchedRuleIds: string[];
  reason: string | null;
}

export class PolicyDeniedError extends ForbiddenException {
  readonly name = 'PolicyDeniedError';

  constructor(
    public readonly phase: PolicyPhase,
    public readonly decision: PolicyEvaluationResult,
  ) {
    super(decision.reason ?? `Tool call denied by ${phase} policy`);
  }
}
