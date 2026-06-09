import { ExecutionContextManager } from './execution-context.manager';

const prismaMock = () => ({
  executionContext: {
    create: jest.fn(async ({ data }) => ({ id: 'ctx1', ...data })),
    findUnique: jest.fn(),
    update: jest.fn(async () => undefined),
  },
});

describe('ExecutionContextManager', () => {
  let prisma: ReturnType<typeof prismaMock>;
  let mgr: ExecutionContextManager;

  beforeEach(() => {
    prisma = prismaMock();
    mgr = new ExecutionContextManager(prisma as any);
  });

  it('create persists a context with defaults', async () => {
    await mgr.create({
      sessionId: 's1',
      userId: 'u1',
      traceId: 't1',
    });
    expect(prisma.executionContext.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sessionId: 's1',
        userId: 'u1',
        traceId: 't1',
        maxApiCalls: 50,
        maxDurationSeconds: 300,
        status: 'active',
      }),
    });
  });

  it('recordToolCall increments currentApiCalls when under limits', async () => {
    prisma.executionContext.findUnique.mockResolvedValue({
      id: 'ctx1',
      allowedTools: ['tool-a'],
      currentApiCalls: 0,
      maxApiCalls: 50,
      maxDurationSeconds: 300,
      startedAt: new Date(),
    });
    await mgr.recordToolCall('ctx1', 'tool-a', 'list_orders');
    expect(prisma.executionContext.update).toHaveBeenCalledWith({
      where: { id: 'ctx1' },
      data: { currentApiCalls: { increment: 1 } },
    });
  });

  it('blocks and terminates when maxApiCalls is exceeded', async () => {
    prisma.executionContext.findUnique.mockResolvedValue({
      id: 'ctx1',
      allowedTools: [],
      currentApiCalls: 50,
      maxApiCalls: 50,
      maxDurationSeconds: 300,
      startedAt: new Date(),
    });
    await expect(
      mgr.recordToolCall('ctx1', 'tool-x', 'anything'),
    ).rejects.toThrow(/max API calls/);
    // Termination write should record the exceeded_limit status.
    expect(prisma.executionContext.update).toHaveBeenCalledWith({
      where: { id: 'ctx1' },
      data: expect.objectContaining({ status: 'exceeded_limit' }),
    });
  });

  it('blocks and records timeout when execution exceeds maxDurationSeconds', async () => {
    prisma.executionContext.findUnique.mockResolvedValue({
      id: 'ctx1',
      allowedTools: [],
      currentApiCalls: 1,
      maxApiCalls: 50,
      maxDurationSeconds: 1,
      startedAt: new Date(Date.now() - 10_000),
    });
    await expect(
      mgr.recordToolCall('ctx1', 'tool-x', 'anything'),
    ).rejects.toThrow(/timed out/);
    expect(prisma.executionContext.update).toHaveBeenCalledWith({
      where: { id: 'ctx1' },
      data: expect.objectContaining({ status: 'timeout' }),
    });
  });

  it('does not block out-of-scope tools in MVP mode but still increments', async () => {
    prisma.executionContext.findUnique.mockResolvedValue({
      id: 'ctx1',
      allowedTools: ['tool-a'],
      currentApiCalls: 0,
      maxApiCalls: 50,
      maxDurationSeconds: 300,
      startedAt: new Date(),
    });
    await expect(mgr.recordToolCall('ctx1', 'tool-x', 'other')).resolves.toBeUndefined();
    expect(prisma.executionContext.update).toHaveBeenCalledWith({
      where: { id: 'ctx1' },
      data: { currentApiCalls: { increment: 1 } },
    });
  });

  it('complete writes completed status', async () => {
    await mgr.complete('ctx1');
    expect(prisma.executionContext.update).toHaveBeenCalledWith({
      where: { id: 'ctx1' },
      data: expect.objectContaining({ status: 'completed' }),
    });
  });
});
