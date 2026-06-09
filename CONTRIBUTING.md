# Contributing

Thanks for your interest in improving Agentic Service Mesh!

## Development setup

```bash
cd backend  && npm install && npm run prisma:generate
cd frontend && npm install
```

The backend needs PostgreSQL + Redis (and OpenSearch + mem0 for Agent memory).
This repo does not ship a local compose stack — point `backend/.env` at your own
instances (or a deployed dev environment). Deployment to AWS/EKS is covered in
[`spec/deployment-workflow.md`](./spec/deployment-workflow.md).

Most contributions (lint, build, unit tests below) do not require a running
backend.

## Before opening a PR

Run the checks that CI enforces:

```bash
# Backend
cd backend && npm run lint && npm run build && npm run test

# Frontend
cd frontend && npm run lint && npm run build
```

- **Tests:** add/adjust Jest tests for backend changes. Keep the suite green.
- **Lint (the gate is zero _errors_):** both packages must report **0 ESLint
  errors**. The **frontend is `any`-free** — keep it that way. The **backend
  carries acknowledged `@typescript-eslint/no-explicit-any` _warnings_** (legacy
  debt, configured as warnings, not errors); don't add new `any`, and prefer to
  reduce the count when you touch a file. Note `backend`'s lint script runs with
  `--fix`, so re-run it before committing to pick up auto-fixes.
- **Types:** no `tsc` errors; avoid `as any` — prefer narrow types or the
  helpers in `frontend/src/lib/utils.ts` (`getErrorMessage`, `itemsOf`).
- **Secrets:** never commit real secrets. `gitleaks` runs in CI; populated
  `infra/k8s/02-secrets.yaml` is gitignored — edit the `.example` instead.

## Commit & PR conventions

- Use clear, imperative commit subjects (e.g. `fix(auth): guard sessions routes`).
- Keep PRs focused; describe the "why", not just the "what".
- Note any schema changes (Prisma) and whether a migration / `db push` is needed.

## Project layout

See [README.md](./README.md#architecture) for the directory map. Key rule: the
runtime uses a **single ReAct Agent** — there is no Router/Specialist multi‑agent
orchestration (see ADR‑7 in the design doc).

## Reporting security issues

See [SECURITY.md](./SECURITY.md) — do not file public issues for vulnerabilities.
