# Infrastructure & Deployment

## AWS / EKS

- Region: us-west-2, VPC with public/private subnets
- EKS managed node group (t3.medium), ALB Ingress Controller
- K8s namespace: `agentic-mesh`
- Docker images **must** be built with `--platform linux/amd64` when building from ARM macOS
- **Important security-group caveat**: EKS auto-generates its own node SG (separate from the custom `eks-nodes` SG in Terraform). RDS / Redis / OpenSearch SGs must allow traffic from the **actual** EKS node SG, not the custom one.

## Test Environment URLs

The ALB hostname is assigned by AWS and changes per environment — fetch it
dynamically instead of hardcoding:

```bash
ALB=$(kubectl get ingress main-ingress -n "${K8S_NAMESPACE:-agentic-mesh}" \
  -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')
echo "http://${ALB}"
```

The paths below are served under that ALB host:

| Module | Path | Description |
|------|------|------|
| Frontend | `/` | React SPA |
| Backend API | `/api` | NestJS REST API (global prefix `/api/v1`) |
| Swagger Docs | `/api/docs` | API documentation |
| Health Check | `/health` | Health check |
| Langfuse | `/langfuse` | Agent execution tracing UI |
| Grafana | `/grafana` | Monitoring dashboards |

In-cluster services (Pod-to-Pod communication only, not exposed via ALB):

| Service | In-cluster Address | Port |
|------|-----------|------|
| mem0 | `http://mem0:8080` | 8080 |
| prometheus | `http://prometheus:9090` | 9090 |
| mock-erp-sales | `http://mock-erp-sales:9001` | 9001 |
| mock-erp-warehouse | `http://mock-erp-warehouse:9002` | 9002 |
| mock-erp-procurement | `http://mock-erp-procurement:9003` | 9003 |
| mock-erp-catalog | `http://mock-erp-catalog:9004` | 9004 |
| mock-erp-finance | `http://mock-erp-finance:9005` | 9005 |

## Terraform (`infra/`)

```
versions.tf        — Terraform >=1.5, AWS ~>5.0
main.tf            — AWS provider (us-west-2, default tags)
variables.tf       — Input variables + locals (name_prefix, common_tags)
data.tf            — aws_caller_identity, VPC, subnets data sources
eks.tf             — EKS cluster + Node Group + OIDC + Add-ons
rds.tf             — RDS PostgreSQL 16 (db.t4g.micro, gp3)
elasticache.tf     — ElastiCache Redis 7.1 (cache.t4g.micro)
opensearch.tf      — OpenSearch 2.13 (t3.small.search)
ecr.tf             — 5 ECR repositories (backend/frontend/mem0-server/mock-erp + mcp-runtime)
iam.tf             — IAM Roles (EKS, IRSA, ALB Controller, EBS CSI)
security-groups.tf — 5 SGs (ALB, EKS nodes, RDS, Redis, OpenSearch)
outputs.tf         — All resource outputs (endpoints, ARNs)
```

## K8s manifests (`infra/k8s/`)

> Only the sanitized `*.yaml.example` templates are tracked in Git. Copy each to
> its `*.yaml` (the runtime manifests are git-ignored) and fill in real values
> before deploying: `for ex in infra/k8s/*.yaml.example; do cp "$ex" "${ex%.example}"; done`

```
00-namespace.yaml    — agentic-mesh namespace
01-configmap.yaml    — NODE_ENV, PORT, service URLs, MCP_RUNTIME_IMAGE
02-secrets.yaml      — DATABASE_URL, REDIS_URL, JWT_SECRET_KEY, API keys, AWS creds
04-backend-rbac.yaml — ServiceAccount + Role/RoleBinding (backend manages MCP server pods)
10-backend.yaml      — Backend Deployment + Service (:8000); BullMQ processors run in-process
12-frontend.yaml     — Frontend nginx Deployment + Service (:3000)
13-mem0.yaml         — mem0 Deployment + Service (:8080); Bedrock embedder/LLM, OpenSearch vector store
16-mock-erp.yaml     — 5x Mock ERP Deployments + Services (:9001-9005)
17-prometheus.yaml   — Prometheus Deployment
18-grafana.yaml      — Grafana Deployment + PVC
19-ingress.yaml      — AWS ALB Ingress (/ → frontend, /api → backend)
```

> Note: there is no separate worker manifest (processors run inside backend),
> no init-db Job (migrations run via `prisma migrate deploy`), and no Langfuse
> manifest (tracing uses Langfuse Cloud).

## Scripts (`infra/scripts/`)

```
deploy-test-env.sh   — One-click deploy: build → ECR push → migrate → EKS rolling update
build-and-push.sh    — Docker build (--platform linux/amd64) + ECR push (5 images)
deploy-k8s.sh        — kubectl apply K8s manifests
init-tf-backend.sh   — Terraform S3 backend initialization
```

See `spec/deployment-workflow.md` for the detailed workflow.
