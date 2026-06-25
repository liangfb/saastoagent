import { IdentitySecurityService } from './identity-security.service';

function makeCredential() {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    name: 'ERP API',
    authType: 'api_key',
    config: { key_value: 'secret' },
    status: 'active',
    expiresAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('IdentitySecurityService audit events', () => {
  it('records credential reveal without exposing secret details in the audit payload', async () => {
    const credential = makeCredential();
    const prisma = {
      credential: {
        findUnique: jest.fn(async () => credential),
      },
    };
    const auditLog = { record: jest.fn(async () => undefined) };
    const service = new IdentitySecurityService(
      prisma as any,
      { enqueueSync: jest.fn() } as any,
      auditLog as any,
    );

    await expect(service.revealCredential(credential.id)).resolves.toBe(credential);
    expect(auditLog.record).toHaveBeenCalledWith({
      action: 'credential.revealed',
      resourceType: 'credential',
      resourceId: credential.id,
      details: {
        name: 'ERP API',
        authType: 'api_key',
      },
    });
  });

  it('does not fail credential reveal when audit logging fails', async () => {
    const credential = makeCredential();
    const service = new IdentitySecurityService(
      {
        credential: {
          findUnique: jest.fn(async () => credential),
        },
      } as any,
      { enqueueSync: jest.fn() } as any,
      { record: jest.fn(async () => Promise.reject(new Error('audit down'))) } as any,
    );

    await expect(service.revealCredential(credential.id)).resolves.toBe(credential);
  });
});
