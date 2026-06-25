jest.mock('langfuse', () => ({
  Langfuse: jest.fn().mockImplementation(() => ({
    trace: jest.fn(),
    flushAsync: jest.fn(async () => undefined),
    shutdownAsync: jest.fn(async () => undefined),
  })),
}));

import { ObservabilityService } from './observability.service';

describe('ObservabilityService logs', () => {
  it('lists audit logs with scalar and JSON detail filters', async () => {
    const createdAt = new Date('2026-06-25T00:00:00.000Z');
    const prisma = {
      auditLog: {
        findMany: jest.fn(async () => [
          {
            id: 1n,
            level: 'info',
            action: 'tool.call.succeeded',
            resourceType: 'mcp_tool',
            resourceId: '11111111-1111-1111-1111-111111111111',
            userId: 'u1',
            traceId: 'trace-1',
            details: { status: 'succeeded', toolName: 'list_orders' },
            createdAt,
          },
        ]),
        count: jest.fn(async () => 1),
      },
    };
    const service = new ObservabilityService(
      prisma as any,
      { listTraces: jest.fn(), getTrace: jest.fn() } as any,
    );

    const result = await service.findAllLogs({
      page: '2',
      pageSize: '10',
      action: 'tool.call.succeeded',
      resourceType: 'mcp_tool',
      traceId: 'trace-1',
      status: 'succeeded',
      toolName: 'list_orders',
    });

    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 10,
        take: 10,
        where: {
          action: 'tool.call.succeeded',
          resourceType: 'mcp_tool',
          traceId: 'trace-1',
          AND: [
            { details: { path: ['status'], equals: 'succeeded' } },
            { details: { path: ['toolName'], equals: 'list_orders' } },
          ],
        },
      }),
    );
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        id: '1',
        action: 'tool.call.succeeded',
        status: 'succeeded',
        toolName: 'list_orders',
        timestamp: createdAt.toISOString(),
      }),
    );
  });
});
