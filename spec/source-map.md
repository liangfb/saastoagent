# Source Code Map

## Backend (`backend/src/`)

```
main.ts                    — NestJS entry: global prefix /api/v1, Swagger /api/docs, health /health, CORS
app.module.ts              — Root module; imports all feature modules; registers global JwtAuthGuard (APP_GUARD)

core/
├── core.module.ts         — @Global: Config(Zod), Pino logging, Prisma, Redis, BullMQ queues, Prometheus, JwtModule + JwtAuthGuard
├── config/
│   ├── app.config.ts      — Zod schema env var validation (DATABASE_URL, JWT_SECRET_KEY, API keys, CORS_ORIGINS, etc.)
│   └── configuration.ts   — Loads and validates appConfigSchema
├── prisma/
│   ├── prisma.module.ts   — Globally exports PrismaService
│   └── prisma.service.ts  — extends PrismaClient, manages PostgreSQL connection lifecycle
├── redis/
│   ├── redis.module.ts    — Globally exports RedisService
│   └── redis.service.ts   — ioredis wrapper, connects to REDIS_URL
├── guards/
│   └── jwt-auth.guard.ts  — Global Bearer-JWT guard; honors @Public(); exempts /metrics + /api/docs
├── decorators/
│   ├── current-user.decorator.ts — @CurrentUser() extracts the authenticated user (JWT payload) from the request
│   └── public.decorator.ts       — @Public() marks a route to bypass the global JwtAuthGuard
├── filters/
│   ├── http-exception.filter.ts  — HttpException → { code, message } formatting
│   └── prisma-exception.filter.ts — Prisma error → HTTP error
├── interceptors/
│   ├── response-transform.interceptor.ts — Wraps all responses as { code: 0, message, data }
│   └── logging.interceptor.ts            — Request/response logging, redact auth headers
├── middleware/
│   └── trace-id.middleware.ts — Generates trace_id for request correlation
├── pipes/
│   └── zod-validation.pipe.ts — Zod schema validation pipe
└── utils/
    └── password.util.ts   — scrypt password hashing + constant-time verify (used by auth + create-user script)

modules/
├── auth/
│   ├── auth.module.ts
│   ├── auth.controller.ts — @Controller('auth'): POST /login (@Public), returns JWT
│   ├── auth.service.ts    — Validates username/password against User table, signs JWT
│   └── dto/auth.dto.ts    — login schema (Zod)
│
├── shared/
│   ├── shared.module.ts       — @Global exports LlmClientService + MastraClientService
│   ├── llm-client.service.ts  — Vercel AI SDK wrapper: generateText/streamText (non-Agent scenarios)
│   ├── mastra-client.service.ts — Mastra model resolver for the single ReAct Agent (Router/Specialist split removed)
│   ├── model-providers.ts     — AI SDK Provider factory (Anthropic/OpenAI/Bedrock)
│   └── pagination.ts          — Pagination utility (page, pageSize, total)
│
├── identity-security/
│   ├── identity-security.module.ts
│   ├── identity-security.controller.ts — @Controller('credentials') CRUD + :id/reveal (unmasked) + :id/test
│   ├── identity-security.service.ts    — Credential management; masks config on list/get/create/update
│   ├── credential-sync.service.ts      — Enqueues credential→K8s Secret sync jobs
│   ├── credential-sync.processor.ts    — BullMQ: pushes credential changes to running MCP Server secrets
│   ├── oauth-refresh.processor.ts      — BullMQ: refreshes OAuth2 tokens nearing expiry
│   ├── oauth-refresh.scheduler.ts      — Periodic scan that enqueues oauth-refresh
│   └── dto/credential.dto.ts
│
├── semantic-engine/
│   ├── semantic-engine.module.ts
│   ├── semantic-engine.controller.ts — sub-controllers:
│   │   OpenapiSourceController: CRUD + preview + parse/enhance/generate-mcp async triggers
│   │   EndpointController: per-endpoint semantic enhancement
│   │   McpServerController: MCP Server list/start-stop/logs/tool management
│   ├── semantic-engine.service.ts — OpenAPI parsing → semantic enhancement → MCP generation; manual paste + base URL handling
│   ├── dto/openapi-source.dto.ts  — create/update schemas (url | file | manual, specContent, baseUrl)
│   ├── processors/
│   │   ├── openapi-parse.processor.ts     — BullMQ: parse spec (URL or stored rawSpec) → Endpoint records
│   │   ├── semantic-enhance.processor.ts  — BullMQ: LLM-enhanced descriptions → SemanticDescription
│   │   └── mcp-generate.processor.ts      — BullMQ: semantic descriptions → McpServer + McpTool, then deploy
│   └── k8s/                       — MCP Server containerization (deploy each source as its own Pod)
│       ├── k8s.service.ts             — K8s API wrapper (apply/scale/logs/readiness)
│       ├── mcp-server-deployer.ts     — Build + apply ConfigMap/Secret/Service/Deployment for an MCP server
│       ├── manifest-builder.ts        — Builds the K8s manifests
│       ├── manifest-helpers.ts        — extractUpstreamBaseUrl / baseUrlFromSpec / parseSpecContent / loadCredentialSecret
│       ├── labels.ts                  — Label/selector helpers
│       └── slug.ts                    — Deterministic deployment slug from source+id
│
├── agent-network/
│   ├── agent-network.module.ts
│   ├── agent-network.controller.ts — @Controller('agents') CRUD + MCP tool bind/unbind + PUT :id/mcp-bindings
│   ├── agent-network.service.ts    — Agent CRUD, isActive, MCP tool bindings
│   ├── agents/
│   │   ├── mastra.config.ts   — Mastra setup
│   │   └── react.agent.ts     — Single ReAct Agent factory (replaces old Router/Specialist agents)
│   ├── mcp-client/
│   │   ├── mcp-client.service.ts    — Manages MCP client connections to deployed MCP servers
│   │   ├── mcp-client.factory.ts    — Creates MCP SDK clients
│   │   ├── mcp-tool-registrar.ts    — Registers each MCP tool as a Mastra tool (typed input schema)
│   │   └── json-schema-to-zod.ts    — Converts a tool's JSON Schema → Zod for arg validation
│   ├── dto/agent.dto.ts       — create/update + setMcpBindings schemas
│   └── memory/
│       └── memory.service.ts  — mem0 REST API wrapper: store/search/getAll/delete (user/agent/run levels)
│
├── sessions/
│   ├── sessions.module.ts
│   ├── sessions.controller.ts — @Controller('sessions') CRUD, sendMessage, SSE stream (@Public); user-scoped via @CurrentUser
│   ├── sessions.service.ts    — Session lifecycle, ReAct Agent invocation, ExecutionContext, mem0 (user-scoped)
│   └── dto/session.dto.ts
│
├── llm-config/
│   ├── llm-config.module.ts
│   ├── llm-config.controller.ts — LlmConfigController (CRUD + test) + LlmAssignmentController
│   ├── llm-config.service.ts    — LlmConfig CRUD, UsageType assignment (semantic/agent/intent)
│   └── dto/llm-config.dto.ts
│
├── observability/
│   ├── observability.module.ts
│   ├── observability.controller.ts — LogsController + TracesController (Langfuse proxy)
│   ├── observability.service.ts    — Log queries, Trace proxy, annotation
│   └── langfuse.service.ts         — Langfuse REST API: trace creation/query/annotation
│
├── policies/
│   ├── policies.module.ts
│   ├── policies.controller.ts      — @Controller('policies') CRUD
│   ├── policies.service.ts         — Policy persistence and change audit
│   ├── policy-engine.service.ts    — Scope/condition evaluation and decision audit
│   ├── policy.types.ts             — Restricted JSON DSL and execution fact types
│   └── dto/policy.dto.ts           — Policy scope/rule validation
│
└── async-tasks/
    ├── async-tasks.module.ts
    ├── async-tasks.controller.ts — @Controller('tasks') list/detail/cancel
    └── async-tasks.service.ts    — BullMQ task lifecycle

prisma/
├── schema.prisma             — Data model (incl. User, Credential, OpenapiSource, Agent, Session, …)
└── create-user.ts            — CLI helper to create a login user (no public registration)
```

## Frontend (`frontend/src/`)

```
main.tsx       — React entry
App.tsx        — Root component (RouterProvider)
router.tsx     — React Router route configuration:
                 /login (public)
                 / → PlaygroundPage (landing; protected by ProtectedRoute)
                 /playground → redirect to /
                 /identity, /openapi, /openapi/:id, /openapi/:id/edit,
                 /mcp-servers, /agents, /models, /policies, /logs

api/
├── index.ts            — Barrel re-exports
├── client.ts           — Axios instance: baseURL /api/v1, bearer token, 401 logout
├── auth.ts             — authApi: login
├── credentials.ts      — credentialsApi: list/getById/reveal/create/update/delete/test
├── openapi-sources.ts  — openapiSourcesApi: CRUD + preview/parse/enhance/generate-mcp/regenerate
├── agents.ts           — agentsApi: CRUD + bindMcp/unbindMcp + setMcpBindings
├── mcp-servers.ts      — mcpServersApi: list/getTools/start/stop/logs
├── sessions.ts         — sessionsApi: CRUD + sendMessage + SSE stream URL
├── llm-configs.ts      — llmConfigsApi + llmAssignmentsApi
├── tasks.ts            — tasksApi: list/getById/cancel
├── observability.ts    — logsApi + tracesApi
└── policies.ts         — policiesApi CRUD

stores/ (Zustand)
├── index.ts            — Barrel re-exports
├── auth.store.ts       — username + token, login/logout (localStorage)
├── theme.store.ts      — light/dark/auto theme
├── credentials.store.ts — items[], loading, fetch/create/update/delete
├── openapi.store.ts     — items[], loading, fetch/create/update/delete
├── agents.store.ts      — items[], loading, fetch/create/update/delete
├── models.store.ts      — configs, assignments, loading
├── sessions.store.ts    — sessions, activeSessionId, messages, traceEvents, sendMessage()
└── logs.store.ts        — logs[], traces[], loading

pages/
├── login/LoginPage.tsx           — Username/password login (real auth via authApi)
├── identity/IdentityPage.tsx     — Credential list + Add/View(reveal)/Edit dialogs (multi-line JSON config, status, expiresAt)
├── openapi/
│   ├── OpenapiPage.tsx           — API source list + Add API (URL load | paste) + Auth selector
│   ├── OpenapiDetailPage.tsx     — Source detail + MCP servers/tools; Edit link
│   ├── OpenapiEditPage.tsx       — Edit (URL/paste dual mode) + Regenerate
│   └── spec-utils.ts             — Local JSON/YAML spec parse + base URL derivation
├── mcp-servers/McpServersPage.tsx — MCP server list, start/stop, view tools/logs
├── agents/AgentsPage.tsx         — Agent list (Status column) + Add/Edit dialog with MCP tool binding
├── models/ModelsPage.tsx         — LLM config list + UsageType assignment cards
├── playground/PlaygroundPage.tsx — Chat (user-right / AI-left) + large composer + Trace viewer
├── logs/LogsPage.tsx             — Log list + filtering
├── policies/PoliciesPage.tsx      — Policy list + JSON scope/rule editor
└── home/HomePage.tsx             — ⚠️ legacy/unused (not routed; landing is now PlaygroundPage)

components/
├── layout/
│   ├── RootLayout.tsx     — Sidebar + Header + <Outlet> (app-canvas background)
│   ├── ProtectedRoute.tsx — Redirects to /login when not authenticated
│   ├── AppSidebar.tsx     — Navigation menu (shadcn/ui Sidebar)
│   ├── AppHeader.tsx      — Top bar
│   └── index.ts
├── shared/
│   ├── PageHeader.tsx     — Page title + description + action buttons
│   ├── DataTableShell.tsx — Generic data table
│   ├── StatusBadge.tsx    — Status badge (active/inactive/pending/failed/running)
│   ├── EmptyState.tsx     — Empty-data placeholder
│   └── index.ts
└── ui/                    — shadcn/ui components (button, card, dialog, table, input, select, tabs, etc.)

types/api.ts — TypeScript interfaces (mirroring Prisma models): ApiResponse, Credential, Agent, Session, OpenapiSource, etc.
hooks/
├── use-mobile.ts          — Responsive breakpoint detection
└── use-session-stream.ts  — Subscribes to a session's SSE trace stream
lib/utils.ts — cn() className merge + getErrorMessage() + itemsOf() (paginated list unwrap)
```

## Supporting Services

```
mem0-server/
├── server.py          — FastAPI mem0 REST wrapper. Routes:
│                          GET  /health
│                          POST /api/v1/memories/            (add)
│                          POST /api/v1/memories/search/     (semantic search)
│                          GET  /api/v1/memories/            (list by user/agent)
│                          GET/PUT/DELETE /api/v1/memories/{id}/
│                          GET  /api/v1/memories/{id}/history/
│                          DELETE /api/v1/memories/          (delete all by user/agent)
│                        Embedder + extraction LLM configurable (default: Bedrock Titan V2 + Claude Sonnet)
├── Dockerfile         — python:3.12-slim + uvicorn (:8080)
└── requirements.txt   — mem0ai, opensearch-py, fastapi, uvicorn, boto3

mock-erp/
├── run_service.py     — Entry: dynamically loads the service based on the SERVICE_NAME env var
├── services/
│   ├── sales_order/   — Order/customer/invoice CRUD
│   ├── warehouse/     — Inventory/bin location/transfer
│   ├── procurement/   — Purchase order/supplier/RFQ
│   ├── finance/       — Accounts/journal entries/payments/AR-AP (API-key protected via X-API-Key)
│   ├── product_catalog/ — Product master data/SKU/pricing
│   └── shared/models.py — Shared Pydantic models
├── Dockerfile         — python:3.12-slim + uvicorn
├── requirements.txt
└── docker-compose.yml — Local 5-service compose
```
