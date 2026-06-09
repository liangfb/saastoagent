# Frontend — Agentic Service Mesh

React 19 + Vite SPA for the Agentic Service Mesh platform. Provides the Identity,
API Resources (OpenAPI), MCP Servers, Agents, Models, Logs, and Playground UIs.

See the [root README](../README.md) for the full project overview.

## Develop

```bash
npm install
npm run dev      # Vite dev server on http://localhost:3000
```

The dev server proxies `/api/v1` to the backend (port 8000). Log in with a user
created via `../infra/scripts/create-user.sh`.

## Scripts

```bash
npm run dev      # start dev server (HMR)
npm run build    # type-check (tsc -b) + production build
npm run lint     # ESLint (must pass clean)
```

## Stack

React 19 · TypeScript · Vite · Tailwind CSS · shadcn/ui (Radix) · Zustand ·
React Router · Axios. Shared error/list helpers live in `src/lib/utils.ts`.
