import { Test } from '@nestjs/testing';
import { CredentialSyncService } from './credential-sync.service';

const queueMock = { add: jest.fn() };

describe('CredentialSyncService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('enqueues sync job when credential is updated', async () => {
    const mod = await Test.createTestingModule({
      providers: [
        CredentialSyncService,
        { provide: 'BullQueue_credential-sync', useValue: queueMock },
      ],
    }).compile();
    const svc = mod.get(CredentialSyncService);
    await svc.enqueueSync('cred-1');
    expect(queueMock.add).toHaveBeenCalledWith(
      'sync',
      { credentialId: 'cred-1' },
      expect.any(Object),
    );
  });
});
