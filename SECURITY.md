# Security Policy

## Reporting a vulnerability

Please **do not** open a public issue for security vulnerabilities. Instead, report
privately via GitHub's "Report a vulnerability" (Security Advisories) on this
repository, or email the maintainers. We aim to acknowledge within 5 business days.

## Security posture (read before deploying)

This project is a **single‑tenant developer/reference platform**, not a hardened
production gateway. Known limitations as of now:

- **Authentication:** username/password login issues a JWT; a global guard
  protects API routes. There is **no RBAC, no multi‑tenant isolation, and no
  OIDC/SSO** yet. There is no public registration — users are created by an
  operator script.
- **Upstream API credentials:** stored as **plaintext JSON** in the database in
  MVP (encryption‑at‑rest is on the roadmap). API responses mask credential
  values; a dedicated JWT‑guarded `/credentials/:id/reveal` endpoint returns the
  unmasked value for the management UI.
- **Secrets:** never commit a populated `infra/k8s/02-secrets.yaml` (it is
  gitignored). Use the `.example` template and a managed secret store
  (AWS Secrets Manager + External Secrets, SOPS, or Sealed Secrets) for real
  deployments. CI runs `gitleaks` to catch accidental secret commits.
- **CORS:** defaults to allowing **all** origins; restrict to your frontend
  origin(s) via the `CORS_ORIGINS` env var (comma-separated allowlist) in production.

## Hardening checklist before production

- [ ] Rotate every credential that ever touched the repo or a shared cluster.
- [ ] Move secrets to a managed store; remove plaintext manifests.
- [ ] Add RBAC + tenant scoping; integrate OIDC/SSO.
- [ ] Encrypt upstream credentials at rest.
- [ ] Lock down CORS and TLS at the ingress.
