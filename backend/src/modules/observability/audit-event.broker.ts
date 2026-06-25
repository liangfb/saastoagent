import { Injectable } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';

export interface AuditEvent {
  type: 'audit_log';
  data: Record<string, unknown>;
}

@Injectable()
export class AuditEventBroker {
  private readonly subject = new Subject<AuditEvent>();

  stream(): Observable<AuditEvent> {
    return this.subject.asObservable();
  }

  emit(data: Record<string, unknown>): void {
    this.subject.next({ type: 'audit_log', data });
  }
}
