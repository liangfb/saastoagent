# Database Models

Schema source of truth: `backend/prisma/schema.prisma` (19 models).

| Model | Description | Key Relations |
|-------|------|---------|
| Credential | API credential (OAuth/API Key) | — |
| OpenapiSource | OpenAPI spec file | → Endpoint[], McpServer[] |
| Endpoint | API endpoint | → EndpointParameter[], SemanticDescription[] |
| SemanticDescription | LLM-enhanced description (versioned) | → Endpoint |
| McpServer | Generated MCP server configuration | → McpTool[], OpenapiSource |
| McpTool | MCP tool definition | → AgentMcpBinding[] |
| Agent | Router/Specialist Agent | → AgentMcpBinding[], RouterMapping[], LlmConfig |
| AgentMcpBinding | Agent↔McpTool N:M | → Agent, McpTool |
| RouterMapping | Intent → Specialist routing | → Agent (router), Agent (target) |
| LlmConfig | Multi-provider model configuration | → LlmModelAssignment[] |
| LlmModelAssignment | UsageType → LlmConfig | semantic_enhancement/agent_reasoning/intent_classification |
| Session | Conversation session | → Message[], Agent |
| Message | Chat message | user/assistant/system/tool roles |
| ExecutionContext | Execution sandbox constraints | API call limits, allowed domains, duration limits |
| AsyncTask | BullMQ task tracking | openapi_parse/semantic_enhance/mcp_generate |
| AuditLog | Immutable audit log | — |
| Policy | Pre-tool and post-tool enforcement rules | Decisions are recorded in AuditLog |

> Agent memory is not stored in PostgreSQL; it is managed by mem0 (OpenSearch). See `memory.service.ts` in the `agent-network` module.
