import { z, ZodTypeAny } from 'zod';

function propToZod(prop: unknown): ZodTypeAny {
  if (!prop || typeof prop !== 'object') return z.any();
  const p = prop as Record<string, unknown>;

  if (Array.isArray(p.anyOf)) {
    const members = p.anyOf
      .map(propToZod)
      .filter((m): m is ZodTypeAny => !!m);
    const nonNull = members.filter((m) => !(m instanceof z.ZodNull));
    const hasNull = members.length !== nonNull.length;
    let base: ZodTypeAny =
      nonNull.length === 0 ? z.any()
      : nonNull.length === 1 ? nonNull[0]
      : z.union(nonNull as [ZodTypeAny, ZodTypeAny, ...ZodTypeAny[]]);
    if (hasNull) base = base.nullable();
    if (typeof p.description === 'string') base = base.describe(p.description);
    return base;
  }

  if (typeof p.$ref === 'string') {
    let base: ZodTypeAny = z.any();
    if (typeof p.description === 'string') base = base.describe(p.description);
    return base;
  }

  let base: ZodTypeAny;
  switch (p.type) {
    case 'string':
      base = z.string();
      break;
    case 'integer':
    case 'number':
      base = z.number();
      break;
    case 'boolean':
      base = z.boolean();
      break;
    case 'array':
      base = z.array(propToZod(p.items ?? {}));
      break;
    case 'object':
      base = z.record(z.any());
      break;
    case 'null':
      base = z.null();
      break;
    default:
      base = z.any();
  }

  if (typeof p.description === 'string') base = base.describe(p.description);
  return base;
}

export function jsonSchemaToZodShape(schema: unknown): Record<string, ZodTypeAny> {
  if (!schema || typeof schema !== 'object') return {};
  const s = schema as Record<string, unknown>;
  const properties = (s.properties ?? {}) as Record<string, unknown>;
  const required = Array.isArray(s.required) ? (s.required as string[]) : [];
  const shape: Record<string, ZodTypeAny> = {};
  for (const [name, prop] of Object.entries(properties)) {
    let zodProp = propToZod(prop);
    if (!required.includes(name)) zodProp = zodProp.optional();
    shape[name] = zodProp;
  }
  return shape;
}
