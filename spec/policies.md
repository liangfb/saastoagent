# Tool Policy Enforcement

## Scope

The policy layer enforces deterministic rules around Agent-initiated MCP tool calls.
This iteration includes policy CRUD, pre-tool enforcement, post-tool enforcement,
and audit logging. Rate limits, ExecutionContext quota changes, shadow mode, and
human approval workflows are intentionally excluded.

Policies default to allow. A matching `deny` rule takes precedence over every
matching `allow` rule.

## Execution Phases

- `pre_tool`: evaluated before `client.callTool()`. A deny prevents the MCP and
  upstream API calls.
- `post_tool`: evaluated after the MCP call succeeds but before its result is
  returned to the Agent. A deny blocks the result; it does not undo upstream side
  effects.

Both phases emit a `policy.decision.allow` or `policy.decision.deny` AuditLog row
with the Trace ID, user, Agent, Session, tool, matched policy/rule IDs, and hashes
of arguments/results. Raw policy inputs are not stored in decision logs.

## Policy Shape

```json
{
  "name": "Large payment guard",
  "description": "Prevent autonomous high-value payments",
  "enabled": true,
  "priority": 100,
  "scope": {
    "toolNames": ["create_payment"]
  },
  "rules": [
    {
      "id": "deny-large-payment",
      "phase": "pre_tool",
      "effect": "deny",
      "when": {
        "all": [
          { "field": "args.amount", "op": "gt", "value": 100000 },
          { "field": "args.currency", "op": "eq", "value": "CNY" }
        ]
      },
      "reason": "Amount exceeds the autonomous execution limit"
    }
  ]
}
```

Scope supports `agentIds`, `mcpServerIds`, `mcpToolIds`, and `toolNames`. Missing
or empty scope lists are wildcards.

The console presents scope as an MCP server and tool selector and persists the
selection as `mcpToolIds`. It requires at least one tool so an accidentally empty
selection cannot create a global policy. The broader scope fields remain
available through the API for future governance integrations.

Conditions support nested `all`, `any`, and `not` nodes. Leaf operators are
`eq`, `neq`, `in`, `not_in`, `exists`, `gt`, `gte`, `lt`, `lte`, and `contains`.
Fact paths must begin with `user`, `agent`, `session`, `context`, `tool`, `args`,
`result`, or `outcome`. The `result` and `outcome` facts only exist in post-tool
evaluation.

## API

All endpoints require the platform JWT:

- `POST /api/v1/policies`
- `GET /api/v1/policies`
- `GET /api/v1/policies/:id`
- `PUT /api/v1/policies/:id`
- `DELETE /api/v1/policies/:id`

Policy updates increment `version`. Create, update, delete, and runtime decisions
are all written to the existing audit log.
