import { Injectable, Logger } from '@nestjs/common';
import { isDeepStrictEqual } from 'node:util';
import type { Policy } from '@prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AuditLogService } from '../observability/audit-log.service';
import { hashForAudit } from '../observability/audit-log.utils';
import type {
  PolicyCondition,
  PolicyConditionLeaf,
  PolicyEvaluationInput,
  PolicyEvaluationResult,
  PolicyFacts,
  PolicyRule,
  PolicyScope,
} from './policy.types';

@Injectable()
export class PolicyEngineService {
  private readonly logger = new Logger(PolicyEngineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog?: AuditLogService,
  ) {}

  async evaluate(input: PolicyEvaluationInput): Promise<PolicyEvaluationResult> {
    const policies = await this.prisma.policy.findMany({
      where: { enabled: true },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    });
    const applicable = policies.filter((policy) =>
      this.matchesScope((policy.scope ?? {}) as PolicyScope, input.facts),
    );

    const matched: Array<{ policy: Policy; rule: PolicyRule }> = [];
    for (const policy of applicable) {
      const rules = Array.isArray(policy.rules) ? (policy.rules as unknown as PolicyRule[]) : [];
      for (const rule of rules) {
        if (rule.phase === input.phase && this.matchesCondition(rule.when, input.facts)) {
          matched.push({ policy, rule });
        }
      }
    }

    const denied = matched.find(({ rule }) => rule.effect === 'deny');
    const matchedPolicyVersions = new Map<string, number>();
    for (const { policy } of matched) matchedPolicyVersions.set(policy.id, policy.version);
    const decision: PolicyEvaluationResult = {
      effect: denied ? 'deny' : 'allow',
      phase: input.phase,
      matchedPolicyIds: [...new Set(matched.map(({ policy }) => policy.id))],
      matchedPolicyVersions: [...matchedPolicyVersions].map(([id, version]) => ({ id, version })),
      matchedRuleIds: matched.map(({ rule }) => rule.id),
      reason: denied?.rule.reason ?? null,
    };
    await this.recordDecision(input, decision);
    return decision;
  }

  private matchesScope(scope: PolicyScope, facts: PolicyFacts): boolean {
    return (
      this.matchesList(scope.agentIds, facts.agent.id) &&
      this.matchesList(scope.mcpServerIds, facts.tool.mcpServerId) &&
      this.matchesList(scope.mcpToolIds, facts.tool.id) &&
      this.matchesList(scope.toolNames, facts.tool.name)
    );
  }

  private matchesList(values: string[] | undefined, actual: string): boolean {
    return !values || values.length === 0 || values.includes(actual);
  }

  private matchesCondition(condition: PolicyCondition, facts: PolicyFacts): boolean {
    if ('all' in condition)
      return condition.all.every((item) => this.matchesCondition(item, facts));
    if ('any' in condition) return condition.any.some((item) => this.matchesCondition(item, facts));
    if ('not' in condition) return !this.matchesCondition(condition.not, facts);
    return this.matchesLeaf(condition, facts);
  }

  private matchesLeaf(condition: PolicyConditionLeaf, facts: PolicyFacts): boolean {
    const actual = this.readPath(facts, condition.field);
    switch (condition.op) {
      case 'eq':
        return isDeepStrictEqual(actual, condition.value);
      case 'neq':
        return !isDeepStrictEqual(actual, condition.value);
      case 'exists':
        return condition.value === false ? actual === undefined : actual !== undefined;
      case 'in':
        return (
          Array.isArray(condition.value) &&
          condition.value.some((v) => isDeepStrictEqual(v, actual))
        );
      case 'not_in':
        return (
          Array.isArray(condition.value) &&
          !condition.value.some((v) => isDeepStrictEqual(v, actual))
        );
      case 'gt':
        return this.compareNumbers(actual, condition.value, (a, b) => a > b);
      case 'gte':
        return this.compareNumbers(actual, condition.value, (a, b) => a >= b);
      case 'lt':
        return this.compareNumbers(actual, condition.value, (a, b) => a < b);
      case 'lte':
        return this.compareNumbers(actual, condition.value, (a, b) => a <= b);
      case 'contains':
        if (typeof actual === 'string' && typeof condition.value === 'string') {
          return actual.includes(condition.value);
        }
        return Array.isArray(actual) && actual.some((v) => isDeepStrictEqual(v, condition.value));
    }
  }

  private compareNumbers(
    actual: unknown,
    expected: unknown,
    compare: (actualNumber: number, expectedNumber: number) => boolean,
  ): boolean {
    return typeof actual === 'number' && typeof expected === 'number' && compare(actual, expected);
  }

  private readPath(root: unknown, path: string): unknown {
    let current = root;
    for (const segment of path.split('.')) {
      if (segment === '__proto__' || segment === 'prototype' || segment === 'constructor') {
        return undefined;
      }
      if (current === null || typeof current !== 'object') return undefined;
      current = (current as Record<string, unknown>)[segment];
    }
    return current;
  }

  private async recordDecision(
    input: PolicyEvaluationInput,
    decision: PolicyEvaluationResult,
  ): Promise<void> {
    if (!this.auditLog) return;
    const details: Record<string, unknown> = {
      phase: decision.phase,
      status: decision.effect === 'deny' ? 'denied' : 'allowed',
      reason: decision.reason,
      matchedPolicyIds: decision.matchedPolicyIds,
      matchedPolicyVersions: decision.matchedPolicyVersions,
      matchedRuleIds: decision.matchedRuleIds,
      agentId: input.facts.agent.id,
      sessionId: input.facts.session.id,
      mcpServerId: input.facts.tool.mcpServerId,
      toolName: input.facts.tool.name,
      argumentsHash: hashForAudit(input.facts.args),
    };
    if (input.phase === 'post_tool') {
      details.resultHash = hashForAudit(input.facts.result);
      details.durationMs = input.facts.outcome?.durationMs ?? null;
      details.upstreamCallCompleted = true;
    }

    try {
      await this.auditLog.record({
        action: `policy.decision.${decision.effect}`,
        resourceType: 'mcp_tool',
        resourceId: input.facts.tool.id,
        traceId: input.facts.context.traceId,
        userId: input.facts.user.id,
        details,
      });
    } catch (error) {
      this.logger.warn(`Failed to record policy decision: ${(error as Error).message}`);
    }
  }
}
