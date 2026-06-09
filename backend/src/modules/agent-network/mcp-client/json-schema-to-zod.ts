import { z } from 'zod';

/**
 * Minimal JSON Schema → Zod converter for the tool input schemas produced by
 * the semantic engine (see buildInputSchema). It covers the subset we actually
 * emit: an object with typed properties + a required[] list, primitive types,
 * arrays, enums, and nested objects. Anything unrecognized degrades to
 * z.unknown() so we never reject a tool we simply can't model precisely.
 */
export function jsonSchemaToZod(schema: unknown): z.ZodTypeAny {
  if (!schema || typeof schema !== 'object') return z.unknown();
  const s = schema as Record<string, any>;

  if (Array.isArray(s.enum) && s.enum.length > 0) {
    const literals = s.enum.map((v: unknown) => z.literal(v as any));
    if (literals.length === 1) return literals[0];
    return z.union(
      literals as unknown as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]],
    );
  }

  const type = Array.isArray(s.type) ? s.type[0] : s.type;

  switch (type) {
    case 'string':
      return z.string();
    case 'integer':
    case 'number':
      return z.number();
    case 'boolean':
      return z.boolean();
    case 'array':
      return z.array(s.items ? jsonSchemaToZod(s.items) : z.unknown());
    case 'object':
      return objectSchema(s);
    default:
      // No usable type (e.g. free-form body schema) → accept anything.
      return s.properties ? objectSchema(s) : z.unknown();
  }
}

function objectSchema(s: Record<string, any>): z.ZodTypeAny {
  const props = (s.properties ?? {}) as Record<string, unknown>;
  const required = new Set<string>(Array.isArray(s.required) ? s.required : []);
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const [key, propSchema] of Object.entries(props)) {
    let field = jsonSchemaToZod(propSchema);
    if (!required.has(key)) field = field.optional();
    shape[key] = field;
  }

  // Allow extra keys we didn't model rather than stripping/rejecting them.
  return z.object(shape).passthrough();
}
