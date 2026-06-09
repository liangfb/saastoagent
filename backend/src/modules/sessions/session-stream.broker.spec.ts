import { firstValueFrom, take, toArray } from 'rxjs';
import { SessionStreamBroker } from './session-stream.broker';

describe('SessionStreamBroker', () => {
  it('delivers emitted events to subscribers on the same session', async () => {
    const broker = new SessionStreamBroker();
    const received = firstValueFrom(broker.stream('s1').pipe(take(2), toArray()));
    broker.emit('s1', { type: 'thinking', data: { content: 'a' } });
    broker.emit('s1', { type: 'done', data: {} });
    const events = await received;
    expect(events.map((e) => e.type)).toEqual(['thinking', 'done']);
  });

  it('does not leak events across sessions', async () => {
    const broker = new SessionStreamBroker();
    const fn = jest.fn();
    broker.stream('s-other').subscribe(fn);
    broker.emit('s1', { type: 'thinking', data: {} });
    expect(fn).not.toHaveBeenCalled();
  });

  it('complete closes the subject and releases future subscribers', async () => {
    const broker = new SessionStreamBroker();
    const onNext = jest.fn();
    const onComplete = jest.fn();
    broker.stream('s1').subscribe({ next: onNext, complete: onComplete });
    broker.emit('s1', { type: 'response', data: { content: 'x' } });
    broker.complete('s1');
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledTimes(1);

    // after complete, a fresh subscription should not receive the old events
    const freshFn = jest.fn();
    broker.stream('s1').subscribe(freshFn);
    broker.emit('s1', { type: 'thinking', data: {} });
    expect(freshFn).toHaveBeenCalledTimes(1);
  });
});
