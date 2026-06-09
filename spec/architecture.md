# Architecture

## Multi-Service Layout

- `backend/` — NestJS 11 API server (port 8000, global prefix `/api/v1`)
- `frontend/` — React 19 + Vite SPA served by nginx (port 3000)
- `mem0-server/` — Python mem0 service for Agent memory (OpenSearch-backed vector search)
- `mock-erp/` — Python mock ERP service for testing (5 services: sales/warehouse/procurement/catalog/finance)
- `mcp-runtime/` — Generic Node.js container image hosting any generated MCP Server at runtime, driven by ConfigMap + Secret injected by Backend
- `infra/` — Terraform (.tf) for AWS + K8s manifests (`infra/k8s/01-19`)

## Backend Module Structure (`backend/src/modules/`)

Four NestJS business modules following Module + Controller + Service + Repository pattern:

- **semantic-engine** — OpenAPI upload → parse → LLM semantic enhancement → MCP Server generation. Uses 3 BullMQ processors (`openapi-parse`, `semantic-enhance`, `mcp-generate`) for async pipeline. `k8s/` sub-package (`K8sService`, `ManifestBuilder`, `McpServerDeployer`, `labels.ts`, `slug.ts`) provisions per-source MCP Server Deployments on EKS via `@kubernetes/client-node`.
- **agent-network** — Router Agent (intent classification + routing) → Specialist Agent (multi-step tool execution). Memory via mem0 REST API with user/agent/session levels. `mcp-client/` sub-package (`McpClientService`, `McpToolRegistrar`, `mcp-client.factory.ts`) connects Specialist Agent to containerized MCP Servers via `@modelcontextprotocol/sdk` Streamable HTTP and exposes each remote tool as a Mastra `createTool`. Per-session client cache with 10-min TTL.
- **identity-security** — OAuth 2.1 + JWT authentication, credential storage, execution context. `credential-sync.service.ts` + `credential-sync.processor.ts` propagate credential updates to K8s Secrets and trigger MCP Server rollout. `oauth-refresh.scheduler.ts` + `oauth-refresh.processor.ts` run a 5-minute repeatable BullMQ job that refreshes OAuth2 tokens approaching expiry.
- **observability** — Langfuse integration for LLM execution tracing.

Supporting modules: `sessions` (playground SSE), `llm-config` (multi-provider model management), `async-tasks` (job tracking).

## Core Infrastructure (`backend/src/core/`)

- `PrismaModule` — DB connection (schema at `backend/prisma/schema.prisma`, 18 models)
- `RedisModule` — Cache + BullMQ queue broker
- `ConfigModule` — Zod-validated env vars (`core/config/app.config.ts`), fails fast on invalid config
- `LoggerModule` — Pino structured JSON logging with sensitive field redaction

## Agent Orchestration (Design Decision)

- **Mastra** (`@mastra/core`) for multi-model Agent orchestration — supports Claude, GPT-4o, Gemini, Bedrock via Vercel AI SDK provider interface
- **Vercel AI SDK** (`ai`) as the underlying multi-provider abstraction layer (shared by Mastra and standalone LLM calls)
- Native MCP integration via `@modelcontextprotocol/sdk` (Mastra direct dependency)
- See `Design/System Design Document.md` ADR-3 and ADR-4 for rationale
