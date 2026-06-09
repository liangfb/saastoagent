# Code Conventions

## Path Aliases

- Backend: `@core/*`, `@modules/*` (defined in `backend/tsconfig.json` paths)
- Frontend: `@/*` → `frontend/src/` (defined in `frontend/tsconfig.json` paths)

## Formatting

Backend Prettier config (`backend/.prettierrc`):
- `singleQuote: true`
- `trailingComma: 'all'`
- `printWidth: 100`
- `semi: true`

## API Conventions

- All API responses use the standardized `{ code, message, data }` wrapper, applied via `ResponseTransformInterceptor`
- Pagination response format: `{ items, total, page, pageSize, totalPages }`
- Health check: `GET /health` (outside the global `/api/v1` prefix)
- Swagger docs: `GET /api/docs`
- Trace ID: every request gets `x-request-id` injected by `TraceIdMiddleware` and propagated through pino logs

## Validation

- Request DTOs are Zod schemas (one per module under `dto/`); controllers apply `ZodValidationPipe(schema)`
- Environment variables validated by `core/config/app.config.ts` Zod schema; app fails fast on invalid config

## Logging

Pino with `redact` for sensitive fields:
- `req.headers.authorization`
- `req.body.config`
- `req.body.credentials`
- `req.body.apiKey`

## Environment Variables

Backend requires:
- `DATABASE_URL` (PostgreSQL)
- `REDIS_URL`
- `JWT_SECRET_KEY`
- `LANGFUSE_HOST` / `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY`
- `MEM0_BASE_URL`
- LLM API keys: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_API_KEY`, `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_REGION`

Reference: `backend/.env.example`.

Frontend requires:
- `VITE_API_BASE_URL=/api/v1`
