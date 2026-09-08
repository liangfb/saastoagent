# SaaS to Agent

Turn existing SaaS / enterprise **OpenAPI (REST) endpoints into AI‑Agent‑callable MCP tools** — then talk to them in natural language.

Upload (or paste) an OpenAPI/Swagger spec; the platform parses it, semantically enriches each endpoint, generates an **MCP Server** that runs as its own container, and lets a single **ReAct Agent** plan and call those tools end‑to‑end from a chat Playground.

## What it does (core)

1. **OpenAPI ingestion** — import a spec by URL or by pasting JSON/YAML (for auth‑gated or disabled doc endpoints).
2. **Semantic enhancement** — an LLM rewrites terse API metadata into Agent‑friendly tool descriptions.
3. **Dynamic MCP runtime** — each source is deployed as an independent MCP Server (K8s pod) that proxies calls to the upstream API, injecting the configured credential (API key / Bearer / OAuth).
4. **Per-tool MCP exposure** — enable only the tools that each MCP Server should publish, then apply the updated runtime configuration without regenerating the source.
5. **Agent Playground** — a single ReAct Agent, bound to a chosen tool set, plans and invokes tools end-to-end from natural-language requests.
6. **Identity & memory** — platform login (JWT), per-user long-term memory via mem0, and managed upstream API credentials.
7. **Observability & audit** — tool calls, platform changes, and policy decisions are recorded with trace correlation; logs support filtering, detail inspection, and live SSE updates.
8. **Tool policies** — deterministic pre-tool and post-tool rules allow or deny MCP calls and results for selected MCP tools, with deny precedence and audited decisions. See [`spec/policies.md`](./spec/policies.md).

## Architecture

| Path | Role |
|------|------|
| `backend/` | NestJS API server (port 8000, prefix `/api/v1`) |
| `frontend/` | React 19 + Vite SPA (port 3000) |
| `mcp-runtime/` | Generic MCP Server container image |
| `mem0-server/` | Python mem0 service (Agent memory, OpenSearch‑backed) |
| `mock-erp/` | 5 Python FastAPI services for E2E testing |
| `infra/` | Terraform + K8s manifests + deploy scripts |

A single **ReAct Agent** (Mastra + Vercel AI SDK) replaces the earlier Router/Specialist multi‑agent design — one Agent reasons over its bound MCP tools directly.

## Deployment (AWS / EKS)

The platform runs on AWS EKS. There are two distinct paths — bootstrap once,
then iterate.

### First-time deploy (bootstrap)

Creates all base resources (namespace, ConfigMap, Secret, Deployments, Service,
Ingress).

```bash
# 1) Provision infrastructure (EKS, RDS, ECR, …)
cd infra && terraform init && terraform apply && cd ..

# 2) Create config from templates, then fill in your values.
cp infra/.env.example infra/.env                                   # AWS region / cluster / account
for ex in infra/k8s/*.yaml.example; do cp "$ex" "${ex%.example}"; done
# Edit infra/.env and the generated infra/k8s/*.yaml — especially
# infra/k8s/02-secrets.yaml (DATABASE_URL, JWT_SECRET_KEY, API keys, …).

# 3) Build + push images, then apply all manifests to create the resources.
./infra/scripts/build-and-push.sh
./infra/scripts/deploy-k8s.sh
```

### Ongoing updates

Once the base resources exist, push new code with the rolling-update script
(build → ECR → migrate → `kubectl set image`). It does **not** create resources
and will abort if the namespace/deployments are missing — run the first-time
deploy above for a fresh cluster.

```bash
./infra/scripts/deploy-test-env.sh                  # all services (also builds + pushes mcp-runtime)
./infra/scripts/deploy-test-env.sh --backend-only   # or a single service
./infra/scripts/deploy-test-env.sh --mcp-runtime-only  # rebuild the MCP runtime image
```

> `mcp-runtime` has no standing deployment — the backend launches it on demand.
> After updating it, **Regenerate** the affected MCP servers to pick up the new image.

See [`spec/deployment-workflow.md`](./spec/deployment-workflow.md) for the full
workflow, prerequisites, and troubleshooting.

Create a login user (no public registration by design):

```bash
./infra/scripts/create-user.sh --username alice
```

## Tech stack

NestJS 11 · React 19 · Mastra + Vercel AI SDK · Prisma + PostgreSQL · Redis + BullMQ · mem0 + OpenSearch · Langfuse · Kubernetes (EKS) · Terraform.

## Security

Before any production / public deployment:

- **Rotate all credentials** and use a managed secret store (see `infra/k8s/02-secrets.yaml.example`).

Report vulnerabilities per [SECURITY.md](./SECURITY.md).

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

[Apache License 2.0](./LICENSE).
