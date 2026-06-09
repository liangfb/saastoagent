import { Injectable } from '@nestjs/common';
import { Subject, Observable } from 'rxjs';

export type StreamEventType =
  | 'thinking'
  | 'tool_call'
  | 'tool_result'
  | 'tool_error'
  | 'response'
  | 'done'
  | 'error';

export interface StreamEvent {
  type: StreamEventType;
  data: Record<string, unknown>;
}

@Injectable()
export class SessionStreamBroker {
  private readonly subjects = new Map<string, Subject<StreamEvent>>();

  private getSubject(sessionId: string): Subject<StreamEvent> {
    let subject = this.subjects.get(sessionId);
    if (!subject) {
      subject = new Subject<StreamEvent>();
      this.subjects.set(sessionId, subject);
    }
    return subject;
  }

  stream(sessionId: string): Observable<StreamEvent> {
    return this.getSubject(sessionId).asObservable();
  }

  emit(sessionId: string, event: StreamEvent): void {
    this.getSubject(sessionId).next(event);
  }

  complete(sessionId: string): void {
    const subject = this.subjects.get(sessionId);
    if (subject) {
      subject.complete();
      this.subjects.delete(sessionId);
    }
  }
}
