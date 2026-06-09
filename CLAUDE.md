# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Agentic Service Mesh — a platform that transforms SaaS REST APIs into AI Agent-callable MCP Servers. Users upload OpenAPI specs; the system parses and semantically enhances them, generates MCP Server configurations, and provides an Agent Playground for natural language interaction with the transformed APIs.

## Top-Level Layout

| Path | Role |
|------|------|
| `backend/` | NestJS 11 API server (port 8000, prefix `/api/v1`) |
| `frontend/` | React 19 + Vite SPA (port 3000) |
| `mcp-runtime/` | Generic MCP Server container image |
| `mem0-server/` | Python mem0 service (Agent memory, OpenSearch-backed) |
| `mock-erp/` | 5 Python FastAPI services for E2E testing |
| `infra/` | Terraform + K8s manifests + deploy scripts |
| `spec/` | Detail specs (architecture, source map, DB, infra, conventions) |

## Common Commands

### Backend (`backend/`)
```bash
npm run dev                    # NestJS watch mode
npm run build                  # Production build
npm run lint                   # ESLint with auto-fix
npm run test                   # Jest unit tests
npm run prisma:generate        # Generate Prisma client after schema changes
npm run prisma:migrate:dev     # Create/apply migration (dev)
npm run prisma:migrate:deploy  # Apply migrations (prod)
```

### Frontend (`frontend/`)
```bash
npm run dev       # Vite dev server (port 3000)
npm run build     # TypeScript compile + Vite build
```


### AWS Deployment (`infra/`)
- `spec/deployment-workflow.md` — Deployment workflow + script usage
```bash
infra/scripts/deploy-test-env.sh    # One-click deploy (build → ECR → migrate → rollout)
infra/scripts/build-and-push.sh     # Docker build + ECR push (must use --platform linux/amd64)
```



## Spec — Read on Demand

Detailed information lives in `spec/`. Load only what the current task needs:

- `spec/architecture.md` — Multi-service layout, NestJS module boundaries, Agent orchestration ADRs
- `spec/source-map.md` — Full source code tree (backend / frontend / supporting services)
- `spec/database.md` — Prisma 18-model cheat sheet
- `spec/infrastructure.md` — AWS/EKS, Terraform layout, K8s manifests, test environment URLs
- `spec/conventions.md` — Path aliases, API/response format, validation, env vars, logging redaction
- `spec/deployment-workflow.md` — Deployment workflow + script usage


## Hard Constraints

- All API responses are wrapped as `{ code, message, data }` (handled by `ResponseTransformInterceptor`)
- Health endpoint `GET /health` lives **outside** the `/api/v1` prefix
- K8s namespace is `agentic-mesh`; do not assume cluster-wide access
- Docker images must be built with `--platform linux/amd64` from ARM macOS
