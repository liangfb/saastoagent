#!/usr/bin/env bash
#
# deploy-test-env.sh — Agentic Service Mesh test environment one-click deploy script
#
# Usage:
#   ./infra/scripts/deploy-test-env.sh [options]
#
# Options:
#   --all              Deploy all services (default; also builds+pushes mcp-runtime)
#   --backend-only     Deploy backend only
#   --frontend-only    Deploy frontend only
#   --mem0-only        Deploy mem0-server only
#   --mock-erp-only    Deploy mock-erp only (all 5 services)
#   --mcp-runtime-only Build + push the mcp-runtime image only (no rollout; the
#                      backend deploys it on demand — Regenerate affected MCP
#                      servers afterwards to pick up the new image)
#   --skip-build     Skip Docker build and push (only update K8s Deployment)
#   --skip-migrate   Skip database migration detection and execution
#   --tag <tag>      Use the specified tag (defaults to git short SHA)
#   --help           Show help information
#
set -euo pipefail

# ============================================================
# Paths + helpers (no side effects — safe before arg parsing)
# ============================================================
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
K8S_DIR="${SCRIPT_DIR}/../k8s"
ENV_FILE="${SCRIPT_DIR}/../.env"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
# Service directories live at the repo root (no src/ wrapper)
SRC_DIR="${PROJECT_ROOT}"

# Colored output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info()    { echo -e "${BLUE}[INFO]${NC} $*"; }
log_success() { echo -e "${GREEN}[OK]${NC}   $*"; }
log_warn()    { echo -e "${YELLOW}[WARN]${NC} $*"; }
log_error()   { echo -e "${RED}[ERROR]${NC} $*"; }

show_help() {
  # Strip the leading "# " (or bare "#") from the header comment block.
  # Use a POSIX-portable regex (BSD/macOS sed has no \? operator).
  sed -n '3,21p' "$0" | sed -E 's/^#( |$)//'
  exit 0
}

# ============================================================
# Argument parsing (FIRST — so --help works without any config,
# and mode-specific checks below can be skipped as needed)
# ============================================================
DEPLOY_BACKEND=false
DEPLOY_FRONTEND=false
DEPLOY_MEM0=false
DEPLOY_MOCK_ERP=false
DEPLOY_MCP_RUNTIME=false
SKIP_BUILD=false
SKIP_MIGRATE=false
CUSTOM_TAG=""
DEPLOY_ALL=true

while [[ $# -gt 0 ]]; do
  case $1 in
    --all)
      DEPLOY_ALL=true; shift ;;
    --backend-only)
      DEPLOY_ALL=false; DEPLOY_BACKEND=true; shift ;;
    --frontend-only)
      DEPLOY_ALL=false; DEPLOY_FRONTEND=true; shift ;;
    --mem0-only)
      DEPLOY_ALL=false; DEPLOY_MEM0=true; shift ;;
    --mock-erp-only)
      DEPLOY_ALL=false; DEPLOY_MOCK_ERP=true; shift ;;
    --mcp-runtime-only)
      DEPLOY_ALL=false; DEPLOY_MCP_RUNTIME=true; shift ;;
    --skip-build)
      SKIP_BUILD=true; shift ;;
    --skip-migrate)
      SKIP_MIGRATE=true; shift ;;
    --tag)
      CUSTOM_TAG="$2"; shift 2 ;;
    --help|-h)
      show_help ;;
    *)
      log_error "Unknown option: $1"
      show_help ;;
  esac
done

# In --all mode, enable every service
if [ "$DEPLOY_ALL" = true ]; then
  DEPLOY_BACKEND=true
  DEPLOY_FRONTEND=true
  DEPLOY_MEM0=true
  DEPLOY_MOCK_ERP=true
  DEPLOY_MCP_RUNTIME=true
fi

# mcp-runtime has no standing K8s deployment — when it's the ONLY target this
# run just builds + pushes an image (CI / build machine), so we skip all
# cluster-dependent steps (manifest preflight, kubeconfig, namespace, rollout).
if [ "${DEPLOY_MCP_RUNTIME}" = true ] && \
   [ "${DEPLOY_BACKEND}" = false ] && [ "${DEPLOY_FRONTEND}" = false ] && \
   [ "${DEPLOY_MEM0}" = false ] && [ "${DEPLOY_MOCK_ERP}" = false ]; then
  NEEDS_K8S=false
else
  NEEDS_K8S=true
fi

# ============================================================
# Configuration (load infra/.env + resolve)
# ============================================================
# Cluster-bound runs require infra/.env and the runtime infra/k8s/*.yaml (both
# git-ignored; create them from the *.example templates). Image-only runs
# (--mcp-runtime-only) don't need manifests and load .env opportunistically.
if [ "${NEEDS_K8S}" = true ]; then
  preflight_missing=0
  if [ ! -f "${ENV_FILE}" ]; then
    echo "MISSING: infra/.env — copy from infra/.env.example and fill it in" >&2
    preflight_missing=1
  fi
  for ex in "${K8S_DIR}"/*.yaml.example; do
    real="${ex%.example}"
    if [ ! -f "${real}" ]; then
      echo "MISSING: ${real} — copy from ${ex} and fill it in" >&2
      preflight_missing=1
    fi
  done
  if [ "${preflight_missing}" -ne 0 ]; then
    echo "Aborting: create the missing configuration files before deploying." >&2
    exit 1
  fi
fi

# Load deploy config from infra/.env when present.
if [ -f "${ENV_FILE}" ]; then
  set -a; . "${ENV_FILE}"; set +a
fi

# Resolve config with env overrides and sensible fallbacks.
REGION="${AWS_REGION:-us-west-2}"
CLUSTER_NAME="${EKS_CLUSTER_NAME:-agentic-mesh-dev}"
NS="${K8S_NAMESPACE:-agentic-mesh}"
ACCOUNT_ID="${AWS_ACCOUNT_ID:-$(aws sts get-caller-identity --query Account --output text)}"
REGISTRY="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"

# ============================================================
# Determine image tag
# ============================================================
cd "${PROJECT_ROOT}"

if [ -n "${CUSTOM_TAG}" ]; then
  TAG="${CUSTOM_TAG}"
else
  TAG=$(git rev-parse --short HEAD)
fi

log_info "Project root: ${PROJECT_ROOT}"
log_info "Image tag: ${TAG}"

# Record deployment start time
DEPLOY_START=$(date +%s)

# Deployment summary collectors
SUMMARY_BUILT=()
SUMMARY_PUSHED=()
SUMMARY_MIGRATED=false
SUMMARY_DEPLOYED=()

# ============================================================
# Step 0: Pre-flight checks
# ============================================================
log_info "=== Step 0: Pre-flight checks ==="

# Check required tools
for CMD in aws kubectl docker git; do
  if ! command -v ${CMD} &> /dev/null; then
    log_error "${CMD} is not installed, please install it first"
    exit 1
  fi
done
log_success "Required tools are ready"

# Verify AWS identity. When AWS_ACCOUNT_ID is pinned in infra/.env, enforce it
# matches the caller (catches wrong-profile mistakes). When auto-detected, just
# confirm we are authenticated.
CALLER_ACCOUNT=$(aws sts get-caller-identity --query Account --output text 2>/dev/null || true)
if [ -z "${CALLER_ACCOUNT}" ]; then
  log_error "Not authenticated to AWS. Please run: aws sso login or check your AWS credentials"
  exit 1
fi
if [ -n "${AWS_ACCOUNT_ID:-}" ] && [ "${CALLER_ACCOUNT}" != "${ACCOUNT_ID}" ]; then
  log_error "AWS account mismatch. Expected (infra/.env): ${ACCOUNT_ID}, actual: ${CALLER_ACCOUNT}"
  log_error "Please check your AWS profile/credentials"
  exit 1
fi
log_success "AWS identity verified (Account: ${CALLER_ACCOUNT})"

# Cluster connectivity is only needed when we actually touch K8s. Image-only
# runs (--mcp-runtime-only) skip kubeconfig + namespace checks.
if [ "${NEEDS_K8S}" = true ]; then
  log_info "Updating kubeconfig..."
  aws eks update-kubeconfig --region "${REGION}" --name "${CLUSTER_NAME}" --quiet 2>/dev/null || \
    aws eks update-kubeconfig --region "${REGION}" --name "${CLUSTER_NAME}"

  if ! kubectl get namespace ${NS} &>/dev/null; then
    log_error "Cannot connect to the EKS cluster or namespace ${NS} does not exist"
    exit 1
  fi
  log_success "EKS cluster connection OK (${CLUSTER_NAME}/${NS})"
else
  log_info "Image-only run (--mcp-runtime-only): skipping kubeconfig + namespace checks."
fi

# ============================================================
# Step 1: Docker build and push
# ============================================================
if [ "${SKIP_BUILD}" = false ]; then
  log_info "=== Step 1: Build and push Docker images ==="

  # ECR login
  log_info "Logging in to ECR..."
  aws ecr get-login-password --region "${REGION}" | \
    docker login --username AWS --password-stdin "${REGISTRY}" 2>/dev/null
  log_success "ECR login succeeded"

  build_and_push() {
    local IMAGE_NAME=$1
    local CONTEXT_DIR=$2

    log_info "Building ${IMAGE_NAME} (--platform linux/amd64)..."
    docker build --platform linux/amd64 \
      -t "${REGISTRY}/agentic-mesh/${IMAGE_NAME}:${TAG}" \
      -t "${REGISTRY}/agentic-mesh/${IMAGE_NAME}:latest" \
      "${CONTEXT_DIR}"
    SUMMARY_BUILT+=("${IMAGE_NAME}:${TAG}")

    log_info "Pushing ${IMAGE_NAME}..."
    docker push "${REGISTRY}/agentic-mesh/${IMAGE_NAME}:${TAG}"
    docker push "${REGISTRY}/agentic-mesh/${IMAGE_NAME}:latest"
    SUMMARY_PUSHED+=("${IMAGE_NAME}:${TAG}")

    log_success "${IMAGE_NAME} build and push complete"
  }

  if [ "${DEPLOY_BACKEND}" = true ]; then
    build_and_push "backend" "${SRC_DIR}/backend"
  fi

  if [ "${DEPLOY_FRONTEND}" = true ]; then
    build_and_push "frontend" "${SRC_DIR}/frontend"
  fi

  if [ "${DEPLOY_MEM0}" = true ]; then
    build_and_push "mem0-server" "${SRC_DIR}/mem0-server"
  fi

  if [ "${DEPLOY_MOCK_ERP}" = true ]; then
    build_and_push "mock-erp" "${SRC_DIR}/mock-erp"
  fi

  if [ "${DEPLOY_MCP_RUNTIME}" = true ]; then
    # mcp-runtime has no standing Deployment — the backend deploys it on demand
    # using MCP_RUNTIME_IMAGE (the :latest tag). So we only build + push here;
    # there is no `kubectl set image`. Its repo name has no agentic-mesh/ prefix.
    MCP_RT_IMAGE="${REGISTRY}/agentic-mesh-dev-mcp-runtime"
    log_info "Building mcp-runtime (--platform linux/amd64)..."
    docker build --platform linux/amd64 \
      -t "${MCP_RT_IMAGE}:${TAG}" -t "${MCP_RT_IMAGE}:latest" \
      "${SRC_DIR}/mcp-runtime"
    SUMMARY_BUILT+=("mcp-runtime:${TAG}")
    log_info "Pushing mcp-runtime..."
    docker push "${MCP_RT_IMAGE}:${TAG}"
    docker push "${MCP_RT_IMAGE}:latest"
    SUMMARY_PUSHED+=("mcp-runtime:${TAG}")
    log_success "mcp-runtime build and push complete"
    log_warn "mcp-runtime updated — Regenerate affected MCP servers (or restart their pods) to pick up the new :latest image."
  fi
else
  log_warn "Skipping Docker build and push (--skip-build)"
fi

# ============================================================
# Step 2: Database migration
# ============================================================
if [ "${SKIP_MIGRATE}" = false ] && [ "${DEPLOY_BACKEND}" = true ]; then
  log_info "=== Step 2: Database migration detection ==="

  # Detect whether the Prisma schema has changed
  PRISMA_CHANGED=false

  # Get the currently running backend image tag (used as a reference for the last deployment)
  CURRENT_IMAGE=$(kubectl get deployment backend -n ${NS} -o jsonpath='{.spec.template.spec.containers[0].image}' 2>/dev/null || echo "")
  CURRENT_TAG=$(echo "${CURRENT_IMAGE}" | awk -F: '{print $NF}')

  if [ -n "${CURRENT_TAG}" ] && [ "${CURRENT_TAG}" != "latest" ] && git rev-parse "${CURRENT_TAG}" &>/dev/null; then
    # If the current tag is a valid git SHA, use it to detect changes
    CHANGED_FILES=$(git diff --name-only "${CURRENT_TAG}..HEAD" -- backend/prisma/ 2>/dev/null || echo "")
    if [ -n "${CHANGED_FILES}" ]; then
      PRISMA_CHANGED=true
      log_warn "Detected Prisma schema changes:"
      echo "${CHANGED_FILES}" | while read -r f; do echo "  - ${f}"; done
    fi
  else
    # Cannot determine the last deployed version, check whether the most recent commit changed prisma
    CHANGED_FILES=$(git diff --name-only HEAD~1..HEAD -- backend/prisma/ 2>/dev/null || echo "")
    if [ -n "${CHANGED_FILES}" ]; then
      PRISMA_CHANGED=true
      log_warn "Detected Prisma schema changes (based on the most recent commit):"
      echo "${CHANGED_FILES}" | while read -r f; do echo "  - ${f}"; done
    fi
  fi

  if [ "${PRISMA_CHANGED}" = true ]; then
    log_info "Running database migration..."

    # Get the current backend Pod (migration must run on the old Pod, since the new Pod is not deployed yet)
    BACKEND_POD=$(kubectl get pods -n ${NS} -l app=backend --field-selector=status.phase=Running -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")

    if [ -z "${BACKEND_POD}" ]; then
      log_error "No running backend Pod found, cannot run migration"
      log_error "Please run the migration manually or use --skip-migrate"
      exit 1
    fi

    log_info "Running prisma migrate deploy on Pod ${BACKEND_POD}..."
    if kubectl exec -n ${NS} "${BACKEND_POD}" -- npx prisma migrate deploy --schema=./prisma/schema.prisma; then
      log_success "Database migration succeeded"
      SUMMARY_MIGRATED=true
    else
      log_error "Database migration failed!"
      log_error "Please check migration status: kubectl exec -n ${NS} ${BACKEND_POD} -- npx prisma migrate status --schema=./prisma/schema.prisma"
      log_error "You can use --skip-migrate to skip migration and continue deploying"
      exit 1
    fi
  else
    log_info "No Prisma schema changes, skipping database migration"
  fi
else
  if [ "${SKIP_MIGRATE}" = true ]; then
    log_warn "Skipping database migration (--skip-migrate)"
  fi
fi

# ============================================================
# Step 3: Deploy to EKS (rolling update)
# ============================================================
log_info "=== Step 3: Deploy to EKS ==="

# Determine the image tag to use (if build was skipped, use latest)
DEPLOY_TAG="${TAG}"
if [ "${SKIP_BUILD}" = true ]; then
  DEPLOY_TAG="latest"
  log_warn "Deploying with the latest tag (because build was skipped)"
fi

if [ "${DEPLOY_BACKEND}" = true ]; then
  log_info "Updating backend deployment..."
  kubectl set image deployment/backend \
    backend="${REGISTRY}/agentic-mesh/backend:${DEPLOY_TAG}" -n ${NS}
  SUMMARY_DEPLOYED+=("backend")
fi

if [ "${DEPLOY_FRONTEND}" = true ]; then
  log_info "Updating frontend deployment..."
  kubectl set image deployment/frontend \
    frontend="${REGISTRY}/agentic-mesh/frontend:${DEPLOY_TAG}" -n ${NS}
  SUMMARY_DEPLOYED+=("frontend")
fi

if [ "${DEPLOY_MEM0}" = true ]; then
  log_info "Updating mem0 deployment..."
  kubectl set image deployment/mem0 \
    mem0="${REGISTRY}/agentic-mesh/mem0-server:${DEPLOY_TAG}" -n ${NS}
  SUMMARY_DEPLOYED+=("mem0")
fi

if [ "${DEPLOY_MOCK_ERP}" = true ]; then
  log_info "Updating mock-erp deployments..."
  for SVC in mock-erp-sales mock-erp-warehouse mock-erp-procurement mock-erp-catalog mock-erp-finance; do
    kubectl set image deployment/${SVC} \
      ${SVC}="${REGISTRY}/agentic-mesh/mock-erp:${DEPLOY_TAG}" -n ${NS}
    SUMMARY_DEPLOYED+=("${SVC}")
  done
fi

# ============================================================
# Step 4: Wait for rollout to complete
# ============================================================
log_info "=== Step 4: Wait for rollout to complete ==="

ROLLOUT_FAILED=false

wait_rollout() {
  local DEPLOYMENT=$1
  local TIMEOUT=${2:-180}

  log_info "Waiting for ${DEPLOYMENT} rollout (timeout: ${TIMEOUT}s)..."
  if kubectl rollout status deployment/${DEPLOYMENT} -n ${NS} --timeout=${TIMEOUT}s; then
    log_success "${DEPLOYMENT} rollout complete"
  else
    log_error "${DEPLOYMENT} rollout failed or timed out"
    ROLLOUT_FAILED=true
  fi
}

if [ "${DEPLOY_BACKEND}" = true ]; then
  wait_rollout "backend" 180
fi

if [ "${DEPLOY_FRONTEND}" = true ]; then
  wait_rollout "frontend" 120
fi

if [ "${DEPLOY_MEM0}" = true ]; then
  wait_rollout "mem0" 120
fi

if [ "${DEPLOY_MOCK_ERP}" = true ]; then
  for SVC in mock-erp-sales mock-erp-warehouse mock-erp-procurement mock-erp-catalog mock-erp-finance; do
    wait_rollout "${SVC}" 120
  done
fi

# ============================================================
# Step 5: Verify deployment
# ============================================================
log_info "=== Step 5: Verify deployment ==="

echo ""
log_info "Pod status:"
kubectl get pods -n ${NS} -o wide

echo ""
log_info "Deployment status:"
kubectl get deployments -n ${NS}

echo ""
log_info "Currently running image versions:"
for DEPLOY in "${SUMMARY_DEPLOYED[@]}"; do
  IMAGE=$(kubectl get deployment ${DEPLOY} -n ${NS} -o jsonpath='{.spec.template.spec.containers[0].image}' 2>/dev/null || echo "N/A")
  echo "  ${DEPLOY}: ${IMAGE}"
done

# Get the Ingress URL
ALB_URL=$(kubectl get ingress main-ingress -n ${NS} -o jsonpath='{.status.loadBalancer.ingress[0].hostname}' 2>/dev/null || echo "")
if [ -n "${ALB_URL}" ]; then
  echo ""
  log_info "ALB URL: http://${ALB_URL}"
fi

# ============================================================
# Deployment summary
# ============================================================
DEPLOY_END=$(date +%s)
DEPLOY_DURATION=$((DEPLOY_END - DEPLOY_START))

echo ""
echo "============================================================"
echo -e "${GREEN}  Deployment summary${NC}"
echo "============================================================"
echo "  Time: $(date '+%Y-%m-%d %H:%M:%S')"
echo "  Duration: ${DEPLOY_DURATION} seconds"
echo "  Tag:  ${DEPLOY_TAG}"
echo "  Git:  $(git rev-parse --short HEAD) ($(git log -1 --format=%s))"
echo ""

if [ ${#SUMMARY_BUILT[@]} -gt 0 ]; then
  echo "  Built images:"
  for IMG in "${SUMMARY_BUILT[@]}"; do
    echo "    - ${IMG}"
  done
else
  echo "  Built images: (skipped)"
fi
echo ""

if [ "${SUMMARY_MIGRATED}" = true ]; then
  echo -e "  Database migration: ${GREEN}executed${NC}"
else
  echo "  Database migration: not executed"
fi
echo ""

echo "  Updated Deployments:"
for DEP in "${SUMMARY_DEPLOYED[@]}"; do
  echo "    - ${DEP}"
done
echo ""

if [ "${ROLLOUT_FAILED}" = true ]; then
  echo -e "  ${RED}Status: Some rollouts failed, please check the logs above${NC}"
  echo ""
  echo "  Rollback command:"
  echo "    kubectl rollout undo deployment/<name> -n ${NS}"
  echo "============================================================"
  exit 1
else
  echo -e "  ${GREEN}Status: All deployments succeeded${NC}"
  if [ -n "${ALB_URL}" ]; then
    echo ""
    echo "  Access URL: http://${ALB_URL}"
  fi
  echo "============================================================"
fi
