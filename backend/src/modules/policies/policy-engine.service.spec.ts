import { PolicyEngineService } from './policy-engine.service';
import type { PolicyFacts } from './policy.types';

function makePolicy(overrides: Record<string, unknown> = {}) {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    name: 'Payment guard',
    description: null,
    enabled: true,
    priority: 100,
    version: 1,
    scope: { toolNames: ['create_payment'] },
    rules: [
      {
        id: 'large-payment',
        phase: 'pre_tool',
        effect: 'deny',
        when: {
          all: [
            { field: 'args.amount', op: 'gt', value: 100000 },
            { field: 'args.currency', op: 'eq', value: 'CNY' },
          ],
        },
        reason: 'Payment amount exceeds the autonomous limit',
      },
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeFacts(overrides: Partial<PolicyFacts> = {}): PolicyFacts {
  return {
    user: { id: 'user-1' },
    agent: { id: 'agent-1' },
    session: { id: 'session-1' },
    context: { id: 'context-1', traceId: 'trace-1' },
    tool: {
      id: '22222222-2222-2222-2222-222222222222',
      name: 'create_payment',
      mcpServerId: 'server-1',
    },
    args: { amount: 150000, currency: 'CNY' },
    ...overrides,
  };
}

describe('PolicyEngineService', () => {
  const auditLog = { record: jest.fn(async () => undefined) };

  beforeEach(() => jest.clearAllMocks());

  it('denies a pre-tool call when scope and all conditions match', async () => {
    const prisma = { policy: { findMany: jest.fn(async () => [makePolicy()]) } };
    const service = new PolicyEngineService(prisma as any, auditLog as any);

    const result = await service.evaluate({ phase: 'pre_tool', facts: makeFacts() });

    expect(result).toMatchObject({
      effect: 'deny',
      matchedRuleIds: ['large-payment'],
      reason: 'Payment amount exceeds the autonomous limit',
    });
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'policy.decision.deny', traceId: 'trace-1' }),
    );
  });

  it('allows by default when a policy scope does not match', async () => {
    const prisma = { policy: { findMany: jest.fn(async () => [makePolicy()]) } };
    const service = new PolicyEngineService(prisma as any, auditLog as any);
    const facts = makeFacts({
      tool: { id: 'tool-2', name: 'list_payments', mcpServerId: 'server-1' },
    });

    const result = await service.evaluate({ phase: 'pre_tool', facts });

    expect(result.effect).toBe('allow');
    expect(result.matchedRuleIds).toEqual([]);
  });

  it('evaluates post-tool result facts and records that upstream completed', async () => {
    const policy = makePolicy({
      rules: [
        {
          id: 'block-secret-output',
          phase: 'post_tool',
          effect: 'deny',
          when: { field: 'result.classification', op: 'eq', value: 'restricted' },
          reason: 'Restricted output cannot be returned to the agent',
        },
      ],
    });
    const prisma = { policy: { findMany: jest.fn(async () => [policy]) } };
    const service = new PolicyEngineService(prisma as any, auditLog as any);

    const result = await service.evaluate({
      phase: 'post_tool',
      facts: makeFacts({
        result: { classification: 'restricted' },
        outcome: { status: 'succeeded', durationMs: 12 },
      }),
    });

    expect(result.effect).toBe('deny');
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({
        details: expect.objectContaining({ upstreamCallCompleted: true, durationMs: 12 }),
      }),
    );
  });

  it('gives deny precedence when allow and deny rules both match', async () => {
    const policy = makePolicy({
      rules: [
        {
          id: 'explicit-allow',
          phase: 'pre_tool',
          effect: 'allow',
          when: { field: 'args.currency', op: 'eq', value: 'CNY' },
          reason: 'CNY is supported',
        },
        {
          id: 'deny-large',
          phase: 'pre_tool',
          effect: 'deny',
          when: { field: 'args.amount', op: 'gt', value: 100000 },
          reason: 'Amount is too large',
        },
      ],
    });
    const prisma = { policy: { findMany: jest.fn(async () => [policy]) } };
    const service = new PolicyEngineService(prisma as any, auditLog as any);

    const result = await service.evaluate({ phase: 'pre_tool', facts: makeFacts() });

    expect(result.effect).toBe('deny');
    expect(result.reason).toBe('Amount is too large');
  });
});
