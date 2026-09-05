/**
 * Unit test for SessionsService.sendMessage (single-Agent ReAct path).
 *
 * Mocks out:
 *   - Prisma (session/agent/bindings/execution-context/message persistence)
 *   - MastraClientService.resolveModel (opaque token)
 *   - createReActAgentInstance (stub agent whose generateLegacy returns canned text)
 *   - MCP client service + registrar (we only care that the right tools are wired)
 *   - MemoryService / LangfuseService / SessionStreamBroker — assert they fire correctly.
 */

const reactAgent = { generateLegacy: jest.fn() };

jest.mock('../agent-network/agents/react.agent', () => ({
  createReActAgentInstance: jest.fn(() => reactAgent),
}));

// langfuse SDK uses a dynamic import that breaks jest module resolution.
jest.mock('langfuse', () => {
  const noopSpan: any = {
    end: jest.fn(),
    update: jest.fn(),
    span: jest.fn(() => noopSpan),
    generation: jest.fn(() => noopSpan),
  };
  const trace: any = {
    id: 'trace-1',
    update: jest.fn(),
    end: jest.fn(),
    generation: jest.fn(() => noopSpan),
    span: jest.fn(() => noopSpan),
  };
  return {
    Langfuse: jest.fn().mockImplementation(() => ({
      trace: jest.fn(() => trace),
      flushAsync: jest.fn(async () => undefined),
      shutdownAsync: jest.fn(async () => undefined),
    })),
  };
});

import { SessionsService } from './sessions.service';
import { SessionStreamBroker } from './session-stream.broker';
import { ExecutionContextManager } from './execution-context.manager';
import { AuditLogService } from '../observability/audit-log.service';
import { ObservabilityService } from '../observability/observability.service';
import { createReActAgentInstance } from '../agent-network/agents/react.agent';

function makePrismaMock() {
  return {
    session: {
      findUnique: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
    message: {
      create: jest.fn(async ({ data }) => ({ id: `msg-${Math.random()}`, ...data })),
    },
    executionContext: {
      update: jest.fn(async () => undefined),
    },
    agent: {
      findUnique: jest.fn(),
    },
    agentMcpBinding: {
      findMany: jest.fn<Promise<any[]>, any[]>(async () => []),
    },
  };
}

function makeContextsMock() {
  return {
    create: jest.fn(async () => ({ id: 'ctx1' })),
    recordToolCall: jest.fn(async () => undefined),
    complete: jest.fn(async () => undefined),
    terminate: jest.fn(async () => undefined),
  } as unknown as ExecutionContextManager;
}

function makeTraceMock() {
  const generation = jest.fn(() => ({ end: jest.fn() }));
  const span = jest.fn(() => ({ end: jest.fn() }));
  const update = jest.fn();
  return {
    obj: { generation, span, update, id: 'trace-1' },
    generation,
    span,
    update,
  };
}

describe('SessionsService.sendMessage', () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let svc: SessionsService;
  let broker: SessionStreamBroker;
  let contexts: ExecutionContextManager;
  let memory: { search: jest.Mock; store: jest.Mock };
  let langfuse: { startTrace: jest.Mock; flush: jest.Mock };
  let mastra: { resolveModel: jest.Mock };
  let mcpClient: { getOrCreate: jest.Mock; closeSession: jest.Mock };
  let registrar: { toMastraTool: jest.Mock };
  let auditLog: { record: jest.Mock };
  let policyEngine: { evaluate: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = makePrismaMock();
    broker = new SessionStreamBroker();
    contexts = makeContextsMock();
    memory = {
      search: jest.fn(async () => [{ id: 'mem1', memory: 'prefers DHL' }]),
      store: jest.fn(async () => undefined),
    };
    const trace = makeTraceMock();
    langfuse = {
      startTrace: jest.fn(() => trace.obj),
      flush: jest.fn(async () => undefined),
    };
    mastra = {
      resolveModel: jest.fn(() => ({ __model: true })),
    };
    mcpClient = {
      getOrCreate: jest.fn(async () => ({ callTool: jest.fn() })),
      closeSession: jest.fn(async () => undefined),
    };
    registrar = {
      toMastraTool: jest.fn(() => ({ __tool: true })),
    };
    auditLog = {
      record: jest.fn(async () => undefined),
    };
    policyEngine = {
      evaluate: jest.fn(async ({ phase }) => ({
        effect: 'allow',
        phase,
        matchedPolicyIds: [],
        matchedPolicyVersions: [],
        matchedRuleIds: [],
        reason: null,
      })),
    };
    svc = new SessionsService(
      prisma as any,
      mcpClient as any,
      registrar as any,
      mastra as any,
      memory as any,
      broker,
      contexts,
      langfuse as any,
      policyEngine as any,
      auditLog as any,
    );
  });

  it('runs the single ReAct agent end-to-end', async () => {
    prisma.session.findUnique.mockResolvedValue({
      id: 's1',
      userId: 'u1',
      agent: {
        id: 'a1',
        name: 'Sales',
        agentType: 'specialist',
        systemPrompt: 'You sell.',
        llmConfig: { provider: 'anthropic', modelId: 'claude-sonnet' },
      },
    });
    reactAgent.generateLegacy.mockResolvedValue({
      text: 'hi',
      toolCalls: [],
      usage: { total: 10 },
    });

    const events: any[] = [];
    broker.stream('s1').subscribe((e) => events.push(e));

    const result = await svc.sendMessage('s1', { content: 'hello' }, 'u1');

    expect(result.content).toBe('hi');
    // user + assistant messages both persisted
    const createdRoles = prisma.message.create.mock.calls.map((c: any) => c[0].data.role);
    expect(createdRoles).toEqual(['user', 'assistant']);
    // execution context lifecycle
    expect(contexts.create).toHaveBeenCalled();
    expect(contexts.complete).toHaveBeenCalledWith('ctx1');
    // langfuse lifecycle
    expect(langfuse.startTrace).toHaveBeenCalled();
    expect(langfuse.flush).toHaveBeenCalled();
    // memory was searched and stored
    expect(memory.search).toHaveBeenCalledWith(
      expect.objectContaining({ query: 'hello', userId: 'u1', agentId: 'a1' }),
    );
    expect(memory.store).toHaveBeenCalled();
    // broker emitted response + done
    const types = events.map((e) => e.type);
    expect(types).toContain('response');
    expect(types).toContain('done');
    // No routing event in single-agent mode
    expect(types).not.toContain('routing');
  });

  it('runs identically for legacy router-typed agents (agentType is ignored)', async () => {
    prisma.session.findUnique.mockResolvedValue({
      id: 's1',
      userId: 'u1',
      agent: {
        id: 'legacy-router',
        name: 'Legacy',
        agentType: 'router',
        systemPrompt: 'old prompt',
        llmConfig: { provider: 'anthropic', modelId: 'claude-haiku' },
      },
    });
    reactAgent.generateLegacy.mockResolvedValue({ text: 'reused', toolCalls: [] });

    const result = await svc.sendMessage('s1', { content: 'hi' }, 'u1');
    expect(result.content).toBe('reused');
    // Single ReAct agent ran exactly once — no router pre-flight pass.
    expect(reactAgent.generateLegacy).toHaveBeenCalledTimes(1);
  });

  it('emits error event and terminates context when agent throws', async () => {
    prisma.session.findUnique.mockResolvedValue({
      id: 's1',
      userId: 'u1',
      agent: {
        id: 'a1',
        name: 'Sales',
        agentType: 'specialist',
        systemPrompt: 'x',
        llmConfig: { provider: 'anthropic', modelId: 'claude-sonnet' },
      },
    });
    reactAgent.generateLegacy.mockRejectedValue(new Error('boom'));

    const events: any[] = [];
    broker.stream('s1').subscribe((e) => events.push(e));

    await expect(svc.sendMessage('s1', { content: 'hi' }, 'u1')).rejects.toThrow('boom');
    expect(events.map((e) => e.type)).toContain('error');
    expect(contexts.terminate).toHaveBeenCalled();
  });

  it('swallows memory failures so chat keeps working', async () => {
    memory.search.mockRejectedValue(new Error('mem0 down'));
    memory.store.mockRejectedValue(new Error('mem0 down'));
    prisma.session.findUnique.mockResolvedValue({
      id: 's1',
      userId: 'u1',
      agent: {
        id: 'a1',
        name: 'Sales',
        agentType: 'specialist',
        systemPrompt: 'x',
        llmConfig: { provider: 'anthropic', modelId: 'claude-sonnet' },
      },
    });
    reactAgent.generateLegacy.mockResolvedValue({ text: 'ok', toolCalls: [] });

    const result = await svc.sendMessage('s1', { content: 'hi' }, 'u1');
    expect(result.content).toBe('ok');
  });

  it('records audit events for MCP tool call lifecycle hooks', async () => {
    let hooks: any;
    registrar.toMastraTool.mockImplementation((_client, _tool, lifecycleHooks) => {
      hooks = lifecycleHooks;
      return { __tool: true };
    });
    prisma.agentMcpBinding.findMany.mockResolvedValue([
      {
        id: 'binding-1',
        mcpTool: {
          id: '11111111-1111-1111-1111-111111111111',
          mcpServerId: '22222222-2222-2222-2222-222222222222',
          toolName: 'list_orders',
          toolDescription: 'List orders',
          inputSchema: { type: 'object' },
          mcpServer: {
            serverConfig: { endpointUrl: 'http://mcp-server/mcp' },
          },
        },
      },
    ]);
    prisma.session.findUnique.mockResolvedValue({
      id: 's1',
      userId: 'u1',
      agent: {
        id: 'a1',
        name: 'Sales',
        agentType: 'specialist',
        systemPrompt: 'x',
        llmConfig: { provider: 'anthropic', modelId: 'claude-sonnet' },
      },
    });
    reactAgent.generateLegacy.mockResolvedValue({ text: 'ok', toolCalls: [] });

    await svc.sendMessage('s1', { content: 'hi' }, 'u1');
    expect(hooks).toBeDefined();
    expect(prisma.agentMcpBinding.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { agentId: 'a1', enabled: true, mcpTool: { enabledInMcp: true } },
      }),
    );

    await hooks.onBefore({
      toolName: 'list_orders',
      args: { customerId: 'c1', token: 'secret-token' },
    });
    await hooks.onSuccess({
      toolName: 'list_orders',
      result: { ok: true, password: 'secret-password' },
      durationMs: 17,
    });
    await hooks.onError({
      toolName: 'list_orders',
      error: new Error('upstream down'),
      durationMs: 19,
    });

    expect(auditLog.record).toHaveBeenCalledTimes(3);
    expect(auditLog.record.mock.calls.map((c) => c[0].action)).toEqual([
      'tool.call.started',
      'tool.call.succeeded',
      'tool.call.failed',
    ]);
    expect(auditLog.record).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        resourceType: 'mcp_tool',
        resourceId: '11111111-1111-1111-1111-111111111111',
        userId: 'u1',
        details: expect.objectContaining({
          sessionId: 's1',
          agentId: 'a1',
          toolName: 'list_orders',
          argumentsHash: expect.any(String),
          argumentsPreview: { customerId: 'c1', token: '****' },
        }),
      }),
    );
    expect(auditLog.record).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        details: expect.objectContaining({
          status: 'succeeded',
          durationMs: 17,
          resultHash: expect.any(String),
          resultPreview: { ok: true, password: '****' },
        }),
      }),
    );
    expect(auditLog.record).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        details: expect.objectContaining({
          status: 'failed',
          durationMs: 19,
          error: 'upstream down',
        }),
      }),
    );
  });

  it('records queryable audit logs during an agent conversation that invokes a tool', async () => {
    const auditRows: any[] = [];
    (prisma as any).auditLog = {
      create: jest.fn(async ({ data }) => {
        const row = {
          id: BigInt(auditRows.length + 1),
          createdAt: new Date(`2026-06-26T00:00:0${auditRows.length}.000Z`),
          ...data,
        };
        auditRows.push(row);
        return row;
      }),
      findMany: jest.fn(async ({ where, orderBy }) => {
        let rows = [...auditRows];
        if (where?.traceId) rows = rows.filter((row) => row.traceId === where.traceId);
        if (where?.resourceType) {
          rows = rows.filter((row) => row.resourceType === where.resourceType);
        }
        if (Array.isArray(where?.AND)) {
          for (const filter of where.AND) {
            const path = filter.details?.path?.[0];
            const expected = filter.details?.equals;
            if (path) rows = rows.filter((row) => row.details?.[path] === expected);
          }
        }
        if (orderBy?.createdAt === 'desc') {
          rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        }
        return rows;
      }),
      count: jest.fn(async ({ where }) => {
        const rows = await (prisma as any).auditLog.findMany({ where });
        return rows.length;
      }),
    };

    const realAuditLog = new AuditLogService(prisma as any);
    const logs = new ObservabilityService(
      prisma as any,
      { listTraces: jest.fn(), getTrace: jest.fn() } as any,
    );
    svc = new SessionsService(
      prisma as any,
      mcpClient as any,
      registrar as any,
      mastra as any,
      memory as any,
      broker,
      contexts,
      langfuse as any,
      policyEngine as any,
      realAuditLog,
    );

    registrar.toMastraTool.mockImplementation((_client, _tool, hooks) => ({
      execute: async (args: Record<string, unknown>) => {
        await hooks.onBefore({ toolName: 'list_orders', args });
        const result = { orders: [{ id: 'SO-1', password: 'secret-password' }] };
        await hooks.onSuccess({ toolName: 'list_orders', result, durationMs: 23 });
        return result;
      },
    }));
    prisma.agentMcpBinding.findMany.mockResolvedValue([
      {
        id: 'binding-1',
        mcpTool: {
          id: '11111111-1111-1111-1111-111111111111',
          mcpServerId: '22222222-2222-2222-2222-222222222222',
          toolName: 'list_orders',
          toolDescription: 'List orders',
          inputSchema: { type: 'object' },
          mcpServer: {
            serverConfig: { endpointUrl: 'http://mcp-server/mcp' },
          },
        },
      },
    ]);
    prisma.session.findUnique.mockResolvedValue({
      id: 's1',
      userId: 'u1',
      agent: {
        id: 'a1',
        name: 'Sales',
        agentType: 'specialist',
        systemPrompt: 'Use tools when needed.',
        llmConfig: { provider: 'anthropic', modelId: 'claude-sonnet' },
      },
    });
    reactAgent.generateLegacy.mockImplementation(async () => {
      const tools = (createReActAgentInstance as jest.Mock).mock.calls.at(-1)[3];
      await tools.list_orders.execute({ customerId: 'c1', token: 'secret-token' });
      return {
        text: 'I found order SO-1.',
        toolCalls: [{ toolName: 'list_orders' }],
        usage: { total: 42 },
      };
    });

    const result = await svc.sendMessage('s1', { content: 'show orders for customer c1' }, 'u1');
    expect(result.content).toBe('I found order SO-1.');

    const started = await logs.findAllLogs({
      traceId: auditRows[0].traceId,
      resourceType: 'mcp_tool',
      status: 'started',
      toolName: 'list_orders',
    });
    const succeeded = await logs.findAllLogs({
      traceId: auditRows[0].traceId,
      resourceType: 'mcp_tool',
      status: 'succeeded',
      toolName: 'list_orders',
    });

    expect(started.total).toBe(1);
    expect(started.items[0]).toEqual(
      expect.objectContaining({
        action: 'tool.call.started',
        resourceType: 'mcp_tool',
        resourceId: '11111111-1111-1111-1111-111111111111',
        userId: 'u1',
        status: 'started',
        toolName: 'list_orders',
      }),
    );
    expect(started.items[0].details).toEqual(
      expect.objectContaining({
        sessionId: 's1',
        agentId: 'a1',
        mcpServerId: '22222222-2222-2222-2222-222222222222',
        mcpToolId: '11111111-1111-1111-1111-111111111111',
        argumentsHash: expect.any(String),
        argumentsPreview: { customerId: 'c1', token: '****' },
      }),
    );
    expect(succeeded.total).toBe(1);
    expect(succeeded.items[0].details).toEqual(
      expect.objectContaining({
        status: 'succeeded',
        durationMs: 23,
        resultHash: expect.any(String),
        resultPreview: { orders: [{ id: 'SO-1', password: '****' }] },
      }),
    );
  });
});
