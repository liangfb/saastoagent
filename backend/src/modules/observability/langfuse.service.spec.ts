const LangfuseCtor = jest.fn().mockImplementation(() => ({
  trace: jest.fn(() => ({ id: 'trace-1' })),
  flushAsync: jest.fn(async () => undefined),
  shutdownAsync: jest.fn(async () => undefined),
}));

jest.mock('langfuse', () => ({ Langfuse: LangfuseCtor }));

import { LangfuseService } from './langfuse.service';

function configWith(values: Record<string, string | undefined>) {
  return { get: (k: string) => values[k] };
}

describe('LangfuseService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('disables itself when credentials are missing (noop trace)', () => {
    const svc = new LangfuseService(configWith({}) as any);
    expect(svc.isEnabled()).toBe(false);
    expect(LangfuseCtor).not.toHaveBeenCalled();
    // noop trace returns an object whose methods are chainable
    const t = svc.startTrace({ name: 'x' });
    expect(typeof t.generation).toBe('function');
    expect(typeof t.span).toBe('function');
    expect(typeof t.end).toBe('function');
  });

  it('instantiates the SDK when both public and secret keys are present', () => {
    const svc = new LangfuseService(
      configWith({
        LANGFUSE_PUBLIC_KEY: 'pk',
        LANGFUSE_SECRET_KEY: 'sk',
        LANGFUSE_HOST: 'http://langfuse',
      }) as any,
    );
    expect(svc.isEnabled()).toBe(true);
    expect(LangfuseCtor).toHaveBeenCalledWith(
      expect.objectContaining({
        publicKey: 'pk',
        secretKey: 'sk',
        baseUrl: 'http://langfuse',
      }),
    );
    svc.startTrace({ name: 'x', sessionId: 's1' });
    const client = LangfuseCtor.mock.results[0].value;
    expect(client.trace).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'x', sessionId: 's1' }),
    );
  });

  it('listTraces hits the Langfuse REST API with Basic auth', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: 't1' }], meta: { totalItems: 5 } }),
    });
    (global as any).fetch = fetchMock;
    const svc = new LangfuseService(
      configWith({
        LANGFUSE_PUBLIC_KEY: 'pk',
        LANGFUSE_SECRET_KEY: 'sk',
        LANGFUSE_HOST: 'http://langfuse',
      }) as any,
    );
    const result = await svc.listTraces({ page: 2, pageSize: 10 });
    expect(result.total).toBe(5);
    expect(result.items).toEqual([{ id: 't1', langfuseUrl: null }]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/api/public/traces');
    expect(String(url)).toContain('page=2');
    expect(String(url)).toContain('limit=10');
    expect((init as any).headers.Authorization).toMatch(/^Basic /);
  });

  it('listTraces enriches items with a langfuseUrl from htmlPath', async () => {
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { id: 't1', htmlPath: '/project/p1/traces/t1' },
          { id: 't2', htmlPath: null },
        ],
        meta: { totalItems: 2 },
      }),
    });
    const svc = new LangfuseService(
      configWith({
        LANGFUSE_PUBLIC_KEY: 'pk',
        LANGFUSE_SECRET_KEY: 'sk',
        LANGFUSE_HOST: 'http://langfuse/',
      }) as any,
    );
    const result = await svc.listTraces();
    expect(result.items[0]).toMatchObject({
      id: 't1',
      langfuseUrl: 'http://langfuse/project/p1/traces/t1',
    });
    expect(result.items[1]).toMatchObject({ id: 't2', langfuseUrl: null });
  });

  it('listTraces returns empty result when unreachable', async () => {
    (global as any).fetch = jest.fn().mockRejectedValue(new Error('down'));
    const svc = new LangfuseService(
      configWith({
        LANGFUSE_PUBLIC_KEY: 'pk',
        LANGFUSE_SECRET_KEY: 'sk',
        LANGFUSE_HOST: 'http://langfuse',
      }) as any,
    );
    await expect(svc.listTraces()).resolves.toEqual({ items: [], total: 0 });
  });

  it('flush forwards to the SDK when enabled and is a noop otherwise', async () => {
    const enabled = new LangfuseService(
      configWith({ LANGFUSE_PUBLIC_KEY: 'pk', LANGFUSE_SECRET_KEY: 'sk' }) as any,
    );
    await enabled.flush();
    const client = LangfuseCtor.mock.results[0].value;
    expect(client.flushAsync).toHaveBeenCalled();

    const disabled = new LangfuseService(configWith({}) as any);
    await expect(disabled.flush()).resolves.toBeUndefined();
  });
});
