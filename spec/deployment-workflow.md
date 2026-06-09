# Agentic Service Mesh — Test Environment Deployment Workflow

This document describes the full workflow for deploying code updates to an AWS
test environment.

## Table of Contents

- [0. Required Configuration Files](#0-required-configuration-files)
- [1. Prerequisites](#1-prerequisites)
- [2. One-Command Deploy (Fast Path)](#2-one-command-deploy-fast-path)
- [3. Step-by-Step Deployment](#3-step-by-step-deployment)
  - [3.1 Detect Changes](#31-detect-changes)
  - [3.2 Build Docker Images](#32-build-docker-images)
  - [3.3 Push to ECR](#33-push-to-ecr)
  - [3.4 Database Migration](#34-database-migration)
  - [3.5 Deploy to EKS](#35-deploy-to-eks)
  - [3.6 Verify Deployment](#36-verify-deployment)
- [4. Selective Deployment](#4-selective-deployment)
- [5. Rollback](#5-rollback)
- [6. Database Migrations in Depth](#6-database-migrations-in-depth)
- [7. Troubleshooting](#7-troubleshooting)

---

## 0. Required Configuration Files

> **You must create these files before deploying.** They are environment- and
> account-specific, contain secrets, and are therefore **git-ignored** — only
> sanitized `*.example` / `*.yaml.example` templates are tracked in the repo.

| What to create | Copy from | Notes |
|----------------|-----------|-------|
| `infra/.env` | `infra/.env.example` | AWS region, EKS cluster name, namespace, account ID. Sourced by the deploy scripts. |
| `infra/k8s/<name>.yaml` (one per service) | `infra/k8s/<name>.yaml.example` | All in-use manifests (`00-namespace`, `01-configmap`, `02-secrets`, `04-backend-rbac`, `10-backend`, `12-frontend`, `13-mem0`, `16-mock-erp`, `17-prometheus`, `18-grafana`, `19-ingress`). |

```bash
# 1) Create the deploy config
cp infra/.env.example infra/.env
$EDITOR infra/.env                      # fill in your AWS region / cluster / account

# 2) Create the K8s manifests from their templates
for ex in infra/k8s/*.yaml.example; do
  cp "$ex" "${ex%.example}"
done
# Then edit the real manifests — especially infra/k8s/02-secrets.yaml — with
# your real values (DATABASE_URL, JWT_SECRET_KEY, API keys, etc.).
```

### Pre-deploy check (run before any deployment)

Confirm `infra/.env` and the in-use `infra/k8s/*.yaml` exist; **stop and create
them first if anything is missing.** The deploy scripts perform this same check
and abort early, but you can run it manually:

```bash
missing=0

# infra/.env
if [ ! -f infra/.env ]; then
  echo "MISSING: infra/.env — copy from infra/.env.example and fill it in"
  missing=1
fi

# in-use K8s manifests (every *.yaml.example must have a real *.yaml sibling)
for ex in infra/k8s/*.yaml.example; do
  real="${ex%.example}"
  if [ ! -f "$real" ]; then
    echo "MISSING: $real — copy from $ex and fill it in"
    missing=1
  fi
done

if [ "$missing" -ne 0 ]; then
  echo "Aborting: create the missing configuration files before deploying."
  exit 1
fi
echo "Configuration files OK."
```

---

## Infrastructure Overview

All environment-specific values come from `infra/.env`. Load them into your
shell so the commands below resolve correctly:

```bash
set -a; . infra/.env; set +a

# Derived values used throughout this doc:
REGISTRY="${AWS_ACCOUNT_ID:-$(aws sts get-caller-identity --query Account --output text)}.dkr.ecr.${AWS_REGION}.amazonaws.com"
NS="${K8S_NAMESPACE}"
```

| Item | Source (`infra/.env`) |
|------|------------------------|
| AWS Account | `AWS_ACCOUNT_ID` (empty → auto-detected via `aws sts get-caller-identity`) |
| Region | `AWS_REGION` |
| EKS Cluster | `EKS_CLUSTER_NAME` |
| K8s Namespace | `K8S_NAMESPACE` |

> The RDS/PostgreSQL endpoint is **not** read from `infra/.env` — set the full
> connection string in `infra/k8s/02-secrets.yaml` → `DATABASE_URL`.

**Service inventory:**

| Service | Source dir | ECR image | Port | K8s Deployment |
|---------|-----------|-----------|------|----------------|
| Backend (NestJS) | `backend/` | `agentic-mesh/backend` | 8000 | `backend` |
| Frontend (React/nginx) | `frontend/` | `agentic-mesh/frontend` | 3000 | `frontend` |
| Mem0 Server (Python) | `mem0-server/` | `agentic-mesh/mem0-server` | 8080 | `mem0` |
| Mock ERP (Python) | `mock-erp/` | `agentic-mesh/mock-erp` | 9001-9005 | `mock-erp-sales`, `mock-erp-warehouse`, `mock-erp-procurement`, `mock-erp-catalog`, `mock-erp-finance` |

> BullMQ processors run inside the backend process — there is no separate
> `worker` deployment.

---

## 1. Prerequisites

> Complete [Section 0](#0-required-configuration-files) first.

### 1.1 Required Tools

```bash
aws --version            # AWS CLI v2
kubectl version --client # kubectl
docker --version         # Docker Desktop (must be running)
node --version           # Node.js 18+ (for Prisma migrations)
npx prisma --version     # Prisma CLI
```

### 1.2 AWS Credentials

```bash
# Option A: AWS SSO (recommended)
aws sso login --profile your-profile

# Option B: Access keys
aws configure

# Verify identity (should match AWS_ACCOUNT_ID in infra/.env, if you pinned it)
aws sts get-caller-identity
```

### 1.3 Configure kubeconfig

```bash
set -a; . infra/.env; set +a
aws eks update-kubeconfig --region "${AWS_REGION}" --name "${EKS_CLUSTER_NAME}"

# Verify connectivity
kubectl get nodes
kubectl get pods -n "${K8S_NAMESPACE}"
```

### 1.4 ECR Login

```bash
set -a; . infra/.env; set +a
REGISTRY="${AWS_ACCOUNT_ID:-$(aws sts get-caller-identity --query Account --output text)}.dkr.ecr.${AWS_REGION}.amazonaws.com"

aws ecr get-login-password --region "${AWS_REGION}" | \
  docker login --username AWS --password-stdin "${REGISTRY}"
```

> **Note:** ECR login tokens are valid for 12 hours. Re-login if you hit auth
> errors while pushing.

---

## 2. One-Command Deploy (Fast Path)

The automated script runs the whole flow. **It first checks that `infra/.env`
and the required `infra/k8s/*.yaml` manifests exist and aborts with a clear
message if any are missing** (see [Section 0](#0-required-configuration-files)).

```bash
# Deploy all services (default)
./infra/scripts/deploy-test-env.sh

# Backend only
./infra/scripts/deploy-test-env.sh --backend-only

# Frontend only
./infra/scripts/deploy-test-env.sh --frontend-only

# mem0-server only
./infra/scripts/deploy-test-env.sh --mem0-only

# mock-erp only (all 5 services)
./infra/scripts/deploy-test-env.sh --mock-erp-only

# mcp-runtime image only (build + push; no rollout — it's deployed on demand by
# the backend. Regenerate affected MCP servers afterwards to pick up the image)
./infra/scripts/deploy-test-env.sh --mcp-runtime-only

# Skip the build (re-deploy existing images)
./infra/scripts/deploy-test-env.sh --skip-build

# Skip database migration
./infra/scripts/deploy-test-env.sh --skip-migrate

# Combine flags
./infra/scripts/deploy-test-env.sh --backend-only --skip-migrate
```

The script automatically:
1. Preflight-checks that `infra/.env` and the runtime `infra/k8s/*.yaml` exist (aborts if missing).
2. Loads config from `infra/.env`.
3. Uses the Git SHA as the image tag.
4. Builds images with `--platform linux/amd64` (EKS nodes are x86_64); `--all` also builds + pushes `mcp-runtime`.
5. Pushes images to ECR.
6. Detects Prisma schema changes and runs migrations.
7. Rolling-updates the EKS Deployments (mcp-runtime has no standing deployment — it's deployed on demand by the backend).
8. Waits for rollout and checks pod health.
9. Prints a deployment summary.

> Note: this script only **updates** existing resources (and builds the
> mcp-runtime image). For a fresh cluster, bootstrap base resources first with
> `deploy-k8s.sh` — see [Section 0](#0-required-configuration-files).

---

## 3. Step-by-Step Deployment

For scenarios needing manual control. Load config first:

```bash
set -a; . infra/.env; set +a
REGISTRY="${AWS_ACCOUNT_ID:-$(aws sts get-caller-identity --query Account --output text)}.dkr.ecr.${AWS_REGION}.amazonaws.com"
NS="${K8S_NAMESPACE}"
GIT_SHA=$(git rev-parse --short HEAD)
```

### 3.1 Detect Changes

```bash
LAST_DEPLOY_SHA="<git SHA of last deploy>"

git diff --name-only ${LAST_DEPLOY_SHA}..HEAD -- backend/      # → rebuild backend
git diff --name-only ${LAST_DEPLOY_SHA}..HEAD -- frontend/     # → rebuild frontend
git diff --name-only ${LAST_DEPLOY_SHA}..HEAD -- mem0-server/  # → rebuild mem0-server
git diff --name-only ${LAST_DEPLOY_SHA}..HEAD -- mock-erp/     # → rebuild mock-erp
git diff --name-only ${LAST_DEPLOY_SHA}..HEAD -- backend/prisma/  # → run migration
```

> **Tip:** if you don't know the last deployed SHA, read the running image tag:
> ```bash
> kubectl get deployment backend -n "${NS}" -o jsonpath='{.spec.template.spec.containers[0].image}'
> ```

### 3.2 Build Docker Images

**Critical: on Apple Silicon (M1/M2/M3) you MUST pass `--platform linux/amd64`,
because EKS nodes are x86_64.**

```bash
docker build --platform linux/amd64 \
  -t ${REGISTRY}/agentic-mesh/backend:${GIT_SHA} \
  -t ${REGISTRY}/agentic-mesh/backend:latest \
  backend/

docker build --platform linux/amd64 \
  -t ${REGISTRY}/agentic-mesh/frontend:${GIT_SHA} \
  -t ${REGISTRY}/agentic-mesh/frontend:latest \
  frontend/

docker build --platform linux/amd64 \
  -t ${REGISTRY}/agentic-mesh/mem0-server:${GIT_SHA} \
  -t ${REGISTRY}/agentic-mesh/mem0-server:latest \
  mem0-server/

docker build --platform linux/amd64 \
  -t ${REGISTRY}/agentic-mesh/mock-erp:${GIT_SHA} \
  -t ${REGISTRY}/agentic-mesh/mock-erp:latest \
  mock-erp/
```

### 3.3 Push to ECR

```bash
# Ensure you are logged in (see 1.4)
aws ecr get-login-password --region "${AWS_REGION}" | \
  docker login --username AWS --password-stdin "${REGISTRY}"

for IMAGE in backend frontend mem0-server mock-erp; do
  docker push ${REGISTRY}/agentic-mesh/${IMAGE}:${GIT_SHA}
  docker push ${REGISTRY}/agentic-mesh/${IMAGE}:latest
done
```

### 3.4 Database Migration

**Only needed when `backend/prisma/` changed.**

```bash
# Option A: run inside the backend pod
BACKEND_POD=$(kubectl get pods -n "${NS}" -l app=backend -o jsonpath='{.items[0].metadata.name}')
kubectl exec -n "${NS}" ${BACKEND_POD} -- npx prisma migrate deploy --schema=./prisma/schema.prisma

# Option B: run locally (needs DATABASE_URL)
kubectl get secret app-secrets -n "${NS}" -o jsonpath='{.data.DATABASE_URL}' | base64 -d
cd backend
DATABASE_URL="<value from above>" npx prisma migrate deploy
```

> **Warning:** ensure the Prisma schema matches the backend image version.
> Recommended order: **run the migration first, then update the Deployment.**

### 3.5 Deploy to EKS

#### Option A: rolling update via `kubectl set image` (recommended)

```bash
kubectl set image deployment/backend \
  backend=${REGISTRY}/agentic-mesh/backend:${GIT_SHA} -n "${NS}"

kubectl set image deployment/frontend \
  frontend=${REGISTRY}/agentic-mesh/frontend:${GIT_SHA} -n "${NS}"

kubectl set image deployment/mem0 \
  mem0=${REGISTRY}/agentic-mesh/mem0-server:${GIT_SHA} -n "${NS}"

for SVC in mock-erp-sales mock-erp-warehouse mock-erp-procurement mock-erp-catalog mock-erp-finance; do
  kubectl set image deployment/${SVC} \
    ${SVC}=${REGISTRY}/agentic-mesh/mock-erp:${GIT_SHA} -n "${NS}"
done
```

#### Option B: re-apply manifests

```bash
# Replaces the ACCOUNT_ID/registry placeholder and applies all manifests.
./infra/scripts/deploy-k8s.sh ${GIT_SHA}
```

> **Note:** `kubectl apply` applies everything, including ConfigMap and Secrets.
> To update only image versions, prefer `kubectl set image`.

#### Wait for rollout

```bash
kubectl rollout status deployment/backend -n "${NS}" --timeout=180s
kubectl rollout status deployment/frontend -n "${NS}" --timeout=120s
kubectl rollout status deployment/mem0 -n "${NS}" --timeout=120s
for SVC in mock-erp-sales mock-erp-warehouse mock-erp-procurement mock-erp-catalog mock-erp-finance; do
  kubectl rollout status deployment/${SVC} -n "${NS}" --timeout=120s
done
```

### 3.6 Verify Deployment

```bash
# 1. Pod status (all should be Running and READY)
kubectl get pods -n "${NS}"

# 2. Pod events (if something looks off)
kubectl describe pods -n "${NS}" -l app=backend

# 3. Service endpoints
kubectl get endpoints -n "${NS}"

# 4. Ingress address (ALB URL)
ALB_URL=$(kubectl get ingress main-ingress -n "${NS}" -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')
echo "ALB URL: http://${ALB_URL}"

# 5. Health checks
curl -s http://${ALB_URL}/api/health
curl -s http://${ALB_URL}/health

# 6. Verify running image versions
echo "--- running images ---"
for DEPLOY in backend frontend mem0 mock-erp-sales; do
  IMAGE=$(kubectl get deployment ${DEPLOY} -n "${NS}" -o jsonpath='{.spec.template.spec.containers[0].image}')
  echo "${DEPLOY}: ${IMAGE}"
done
```

---

## 4. Selective Deployment

> Load config first: `set -a; . infra/.env; set +a` and set `REGISTRY`, `NS`,
> `GIT_SHA` as in [Section 3](#3-step-by-step-deployment).

### Backend only

```bash
docker build --platform linux/amd64 \
  -t ${REGISTRY}/agentic-mesh/backend:${GIT_SHA} \
  -t ${REGISTRY}/agentic-mesh/backend:latest \
  backend/
docker push ${REGISTRY}/agentic-mesh/backend:${GIT_SHA}
docker push ${REGISTRY}/agentic-mesh/backend:latest

# Migrate if schema changed
BACKEND_POD=$(kubectl get pods -n "${NS}" -l app=backend -o jsonpath='{.items[0].metadata.name}')
kubectl exec -n "${NS}" ${BACKEND_POD} -- npx prisma migrate deploy --schema=./prisma/schema.prisma

kubectl set image deployment/backend backend=${REGISTRY}/agentic-mesh/backend:${GIT_SHA} -n "${NS}"
kubectl rollout status deployment/backend -n "${NS}" --timeout=180s
```

### Frontend only

```bash
docker build --platform linux/amd64 \
  -t ${REGISTRY}/agentic-mesh/frontend:${GIT_SHA} \
  -t ${REGISTRY}/agentic-mesh/frontend:latest \
  frontend/
docker push ${REGISTRY}/agentic-mesh/frontend:${GIT_SHA}
docker push ${REGISTRY}/agentic-mesh/frontend:latest

kubectl set image deployment/frontend frontend=${REGISTRY}/agentic-mesh/frontend:${GIT_SHA} -n "${NS}"
kubectl rollout status deployment/frontend -n "${NS}" --timeout=120s
```

### Mem0 Server only

```bash
docker build --platform linux/amd64 \
  -t ${REGISTRY}/agentic-mesh/mem0-server:${GIT_SHA} \
  -t ${REGISTRY}/agentic-mesh/mem0-server:latest \
  mem0-server/
docker push ${REGISTRY}/agentic-mesh/mem0-server:${GIT_SHA}
docker push ${REGISTRY}/agentic-mesh/mem0-server:latest

kubectl set image deployment/mem0 mem0=${REGISTRY}/agentic-mesh/mem0-server:${GIT_SHA} -n "${NS}"
kubectl rollout status deployment/mem0 -n "${NS}" --timeout=120s
```

### Mock ERP only

```bash
docker build --platform linux/amd64 \
  -t ${REGISTRY}/agentic-mesh/mock-erp:${GIT_SHA} \
  -t ${REGISTRY}/agentic-mesh/mock-erp:latest \
  mock-erp/
docker push ${REGISTRY}/agentic-mesh/mock-erp:${GIT_SHA}
docker push ${REGISTRY}/agentic-mesh/mock-erp:latest

for SVC in mock-erp-sales mock-erp-warehouse mock-erp-procurement mock-erp-catalog mock-erp-finance; do
  kubectl set image deployment/${SVC} ${SVC}=${REGISTRY}/agentic-mesh/mock-erp:${GIT_SHA} -n "${NS}"
done
for SVC in mock-erp-sales mock-erp-warehouse mock-erp-procurement mock-erp-catalog mock-erp-finance; do
  kubectl rollout status deployment/${SVC} -n "${NS}" --timeout=120s
done
```

---

## 5. Rollback

> Load config first: `set -a; . infra/.env; set +a; NS="${K8S_NAMESPACE}"`.

### 5.1 `kubectl rollout undo` (quick rollback)

```bash
kubectl rollout undo deployment/backend -n "${NS}"
kubectl rollout undo deployment/frontend -n "${NS}"
kubectl rollout undo deployment/mem0 -n "${NS}"
for SVC in mock-erp-sales mock-erp-warehouse mock-erp-procurement mock-erp-catalog mock-erp-finance; do
  kubectl rollout undo deployment/${SVC} -n "${NS}"
done

kubectl rollout status deployment/backend -n "${NS}" --timeout=180s
```

### 5.2 Roll back to a specific revision

```bash
kubectl rollout history deployment/backend -n "${NS}"
kubectl rollout undo deployment/backend -n "${NS}" --to-revision=2
```

### 5.3 Roll back by image tag

```bash
ROLLBACK_SHA="<git short SHA to roll back to>"
kubectl set image deployment/backend \
  backend=${REGISTRY}/agentic-mesh/backend:${ROLLBACK_SHA} -n "${NS}"
```

### 5.4 Database rollback

> **Important:** Prisma migrate has no automatic rollback. Handle failed
> migrations manually.

```bash
BACKEND_POD=$(kubectl get pods -n "${NS}" -l app=backend -o jsonpath='{.items[0].metadata.name}')
kubectl exec -n "${NS}" ${BACKEND_POD} -- npx prisma migrate status --schema=./prisma/schema.prisma

# To roll back, connect to the DB and run reverse SQL manually. The RDS host is
# in the DATABASE_URL in infra/k8s/02-secrets.yaml (or read it from the running
# pod: kubectl get secret app-secrets -n "${NS}" -o jsonpath='{.data.DATABASE_URL}' | base64 -d).
```

---

## 6. Database Migrations in Depth

### 6.1 Create a new migration locally

```bash
cd backend

# Point DATABASE_URL at a LOCAL/dev database (never prod/test!)
export DATABASE_URL="postgresql://user:password@localhost:5432/agentic_mesh_dev"

npx prisma migrate dev --name describe_your_change

git add prisma/migrations/
git commit -m "feat: add migration - describe_your_change"
```

### 6.2 Apply a migration to the test environment

```bash
set -a; . infra/.env; set +a; NS="${K8S_NAMESPACE}"
BACKEND_POD=$(kubectl get pods -n "${NS}" -l app=backend -o jsonpath='{.items[0].metadata.name}')
kubectl exec -n "${NS}" ${BACKEND_POD} -- npx prisma migrate deploy --schema=./prisma/schema.prisma
```

### 6.3 Handle migration failures

```bash
kubectl exec -n "${NS}" ${BACKEND_POD} -- npx prisma migrate status --schema=./prisma/schema.prisma

# Mark a failed migration as rolled back
kubectl exec -n "${NS}" ${BACKEND_POD} -- npx prisma migrate resolve --rolled-back <migration_name> --schema=./prisma/schema.prisma

# Mark a manually-applied migration as applied
kubectl exec -n "${NS}" ${BACKEND_POD} -- npx prisma migrate resolve --applied <migration_name> --schema=./prisma/schema.prisma
```

### 6.4 Destructive migration warnings

| Operation | Risk | Recommendation |
|-----------|------|----------------|
| `DROP TABLE` | **High** | Confirm no other service depends on it |
| `DROP COLUMN` | **High** | Deploy code that no longer uses the column first |
| Rename table/column | **Medium** | Use expand→migrate→contract (add, backfill, drop) |
| Change column type | **Medium** | Confirm data converts safely |
| Add NOT NULL column (no default) | **Medium** | Ensure existing rows get a sensible default |

> **Best practice:** test migrations on a local DB first. Preview SQL with
> `prisma migrate diff` for destructive changes.

---

## 7. Troubleshooting

### 7.1 `exec format error`

**Symptom:** pod CrashLoopBackOff immediately, logs show `exec format error`.
**Cause:** image built on ARM (Apple Silicon) but EKS nodes are x86_64.
**Fix:** rebuild with `docker build --platform linux/amd64 ...`.

### 7.2 `ImagePullBackOff` / `ErrImagePull`

```bash
kubectl describe pod <pod-name> -n "${NS}"

# 1. Tag doesn't exist — check ECR
aws ecr describe-images --repository-name agentic-mesh/backend --region "${AWS_REGION}"
# 2. ECR auth — EKS node IAM role needs AmazonEC2ContainerRegistryReadOnly
# 3. Wrong image name — check the deployment's image field
kubectl get deployment backend -n "${NS}" -o jsonpath='{.spec.template.spec.containers[0].image}'
```

### 7.3 Health check failures

```bash
kubectl logs <pod-name> -n "${NS}"
kubectl logs <pod-name> -n "${NS}" --previous   # last crash
kubectl port-forward <pod-name> 8000:8000 -n "${NS}"
curl http://localhost:8000/health
```

**Health endpoints:**
| Service | Endpoint | Port |
|---------|----------|------|
| backend | `/health` | 8000 |
| frontend | `/health` | 3000 |
| mem0 | `/health` | 8080 |

### 7.4 Database migration failures

```bash
kubectl exec -n "${NS}" ${BACKEND_POD} -- npx prisma migrate status --schema=./prisma/schema.prisma
kubectl exec -n "${NS}" ${BACKEND_POD} -- env | grep DATABASE_URL
# Common causes: network/security-group, migration-history mismatch, SQL errors.
# See 6.3 for resolving failed migrations.
```

### 7.5 Rollout timeout

```bash
kubectl get rs -n "${NS}" -l app=backend
kubectl get pods -n "${NS}" -l app=backend
kubectl describe pod <problematic-pod> -n "${NS}"
kubectl describe nodes | grep -A 5 "Allocated resources"   # resource pressure
kubectl rollout undo deployment/backend -n "${NS}"          # emergency rollback
```

### 7.6 ALB/Ingress unreachable

```bash
kubectl get ingress -n "${NS}"
kubectl describe ingress main-ingress -n "${NS}"
kubectl logs -n kube-system -l app.kubernetes.io/name=aws-load-balancer-controller
kubectl get endpoints -n "${NS}"
# 502 → backend pod not ready; 503 → no healthy target
```

### 7.7 Env var / Secret issues

```bash
kubectl get configmap app-config -n "${NS}" -o yaml
kubectl get secret app-secrets -n "${NS}" -o yaml   # values are base64-encoded

# After changing a ConfigMap/Secret, restart pods to pick it up
kubectl rollout restart deployment/backend -n "${NS}"
```

---

## Appendix: Command Cheatsheet

```bash
set -a; . infra/.env; set +a; NS="${K8S_NAMESPACE}"

kubectl get all -n "${NS}"
kubectl logs -f deployment/backend -n "${NS}"
kubectl exec -it deployment/backend -n "${NS}" -- /bin/sh
aws ecr list-images --repository-name agentic-mesh/backend --region "${AWS_REGION}"

kubectl port-forward deployment/backend 8000:8000 -n "${NS}"
kubectl port-forward deployment/frontend 3000:3000 -n "${NS}"
kubectl port-forward deployment/mem0 8080:8080 -n "${NS}"
```
