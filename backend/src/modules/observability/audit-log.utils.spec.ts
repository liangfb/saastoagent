import { hashForAudit, sanitizeForAudit } from './audit-log.utils';

describe('audit-log.utils', () => {
  it('masks sensitive fields recursively', () => {
    const result = sanitizeForAudit({
      username: 'alice',
      password: 'secret',
      nested: {
        access_token: 'tok',
        apiKey: 'key',
        safe: 'value',
      },
      headers: {
        authorization: 'Bearer abc',
      },
    });

    expect(result).toEqual({
      username: 'alice',
      password: '****',
      nested: {
        access_token: '****',
        apiKey: '****',
        safe: 'value',
      },
      headers: {
        authorization: '****',
      },
    });
  });

  it('truncates large previews without losing audit shape', () => {
    const result = sanitizeForAudit(
      Object.fromEntries(Array.from({ length: 200 }, (_, i) => [`field${i}`, `value${i}`])),
    ) as Record<string, unknown>;
    expect(result.truncated).toBe(true);
    expect(String(result.preview).length).toBeLessThanOrEqual(4096);
  });

  it('hashes objects with stable key ordering', () => {
    expect(hashForAudit({ b: 2, a: 1 })).toBe(hashForAudit({ a: 1, b: 2 }));
    expect(hashForAudit({ a: 1 })).not.toBe(hashForAudit({ a: 2 }));
  });
});
