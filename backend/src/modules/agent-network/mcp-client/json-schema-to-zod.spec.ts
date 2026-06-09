import { jsonSchemaToZod } from './json-schema-to-zod';

describe('jsonSchemaToZod', () => {
  it('enforces required props and types on an object schema', () => {
    const schema = jsonSchemaToZod({
      type: 'object',
      properties: { quantity: { type: 'integer' }, sku: { type: 'string' } },
      required: ['quantity', 'sku'],
    });
    expect(schema.safeParse({ quantity: 2, sku: 'ABC' }).success).toBe(true);
    expect(schema.safeParse({ quantity: 'two', sku: 'ABC' }).success).toBe(false);
    expect(schema.safeParse({ quantity: 2 }).success).toBe(false); // missing sku
  });

  it('treats non-required props as optional and allows extra keys', () => {
    const schema = jsonSchemaToZod({
      type: 'object',
      properties: { status: { type: 'string' } },
    });
    expect(schema.safeParse({}).success).toBe(true);
    expect(schema.safeParse({ status: 'open', extra: 1 }).success).toBe(true);
  });

  it('maps primitives, arrays and enums', () => {
    expect(jsonSchemaToZod({ type: 'string' }).safeParse('x').success).toBe(true);
    expect(jsonSchemaToZod({ type: 'number' }).safeParse('x').success).toBe(false);
    expect(jsonSchemaToZod({ type: 'array', items: { type: 'string' } }).safeParse(['a']).success).toBe(true);
    const e = jsonSchemaToZod({ type: 'string', enum: ['a', 'b'] });
    expect(e.safeParse('a').success).toBe(true);
    expect(e.safeParse('c').success).toBe(false);
  });

  it('degrades to permissive for unknown/empty schemas', () => {
    expect(jsonSchemaToZod(undefined).safeParse({ anything: true }).success).toBe(true);
    expect(jsonSchemaToZod({}).safeParse('whatever').success).toBe(true);
  });
});
