import { firstValueFrom, take, toArray } from 'rxjs';
import { AuditEventBroker } from './audit-event.broker';

describe('AuditEventBroker', () => {
  it('streams emitted audit log events to subscribers', async () => {
    const broker = new AuditEventBroker();
    const received = firstValueFrom(broker.stream().pipe(take(2), toArray()));

    broker.emit({ id: '1', action: 'credential.revealed' });
    broker.emit({ id: '2', action: 'tool.call.succeeded' });

    await expect(received).resolves.toEqual([
      { type: 'audit_log', data: { id: '1', action: 'credential.revealed' } },
      { type: 'audit_log', data: { id: '2', action: 'tool.call.succeeded' } },
    ]);
  });
});
