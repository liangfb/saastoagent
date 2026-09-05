import { z } from 'zod';
import {
  POLICY_EFFECTS,
  POLICY_OPERATORS,
  POLICY_PHASES,
  type PolicyCondition,
} from '../policy.types';

const uuidList = z.array(z.string().uuid()).max(200).optional();

export const policyScopeSchema = z
  .object({
    agentIds: uuidList,
    mcpServerIds: uuidList,
    mcpToolIds: uuidList,
    toolNames: z.array(z.string().min(1).max(255)).max(200).optional(),
  })
  .strict();

const fieldSchema = z
  .string()
  .min(1)
  .max(500)
  .regex(
    /^(user|agent|session|context|tool|args|result|outcome)(\.[A-Za-z0-9_-]+)*$/,
    'Condition field must start with a supported policy fact',
  );

export const policyConditionSchema: z.ZodType<PolicyCondition> = z.lazy(() =>
  z.union([
    z
      .object({
        field: fieldSchema,
        op: z.enum(POLICY_OPERATORS),
        value: z.unknown().optional(),
      })
      .strict()
      .superRefine((condition, ctx) => {
        if (condition.op !== 'exists' && condition.value === undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['value'],
            message: `Operator ${condition.op} requires a value`,
          });
        }
        if (
          condition.op === 'exists' &&
          condition.value !== undefined &&
          typeof condition.value !== 'boolean'
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['value'],
            message: 'Operator exists only accepts a boolean value',
          });
        }
      }),
    z.object({ all: z.array(policyConditionSchema).min(1).max(20) }).strict(),
    z.object({ any: z.array(policyConditionSchema).min(1).max(20) }).strict(),
    z.object({ not: policyConditionSchema }).strict(),
  ]),
);

export const policyRuleSchema = z
  .object({
    id: z.string().min(1).max(100),
    phase: z.enum(POLICY_PHASES),
    effect: z.enum(POLICY_EFFECTS),
    when: policyConditionSchema,
    reason: z.string().min(1).max(1000),
  })
  .strict();

export const createPolicySchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).nullish(),
  enabled: z.boolean().optional().default(true),
  priority: z.number().int().min(-10000).max(10000).optional().default(0),
  scope: policyScopeSchema.optional().default({}),
  rules: z.array(policyRuleSchema).min(1).max(100),
});

export const updatePolicySchema = createPolicySchema.partial();

export type CreatePolicyDto = z.infer<typeof createPolicySchema>;
export type UpdatePolicyDto = z.infer<typeof updatePolicySchema>;
