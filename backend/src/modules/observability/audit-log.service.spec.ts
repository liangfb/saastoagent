import { AuditLogService } from './audit-log.service';

describe('AuditLogService', () => {
  it('sanitizes details, adds a hash, and writes an audit row', async () => {
    const create = jest.fn().mockResolvedValue({ id: 1n });
    const service = new AuditLogService({ auditLog: { create } } as any);

    await service.record({
      action: 'credential.revealed',
      resourceType: 'credential',
      resourceId: '11111111-1111-1111-1111-111111111111',
      traceId: 'trace-1',
      userId: 'user-1',
      details: {
        credentialName: 'ERP',
        token: 'super-secret',
      },
    });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'credential.revealed',
        resourceType: 'credential',
        resourceId: '11111111-1111-1111-1111-111111111111',
        traceId: 'trace-1',
        userId: 'user-1',
        details: expect.objectContaining({
          credentialName: 'ERP',
          token: '****',
          audit: expect.objectContaining({
            detailsHash: expect.any(String),
          }),
        }),
      }),
    });
  });

  it('generates a trace id when callers do not provide one', async () => {
    const create = jest.fn().mockResolvedValue({ id: 1n });
    const service = new AuditLogService({ auditLog: { create } } as any);

    await service.record({ action: 'mcp.server.started' });

    expect(create.mock.calls[0][0].data.traceId).toEqual(expect.any(String));
  });
});
