#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
K8S_DIR="$(cd "${SCRIPT_DIR}/../k8s" && pwd)"
ENV_FILE="${SCRIPT_DIR}/../.env"

# ── Preflight: required config must exist ─────────────────────
# infra/.env and the runtime infra/k8s/*.yaml are git-ignored; users create
# them from the *.example templates. Abort early if any are missing.
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

# Load deploy config from infra/.env.
set -a; . "${ENV_FILE}"; set +a

# Resolve config with env overrides and sensible fallbacks.
REGION="${AWS_REGION:-us-west-2}"
CLUSTER_NAME="${EKS_CLUSTER_NAME:-agentic-mesh-dev}"
NS="${K8S_NAMESPACE:-agentic-mesh}"
ACCOUNT_ID="${AWS_ACCOUNT_ID:-$(aws sts get-caller-identity --query Account --output text)}"
REGISTRY="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"
TAG="${1:-latest}"

echo "Updating kubeconfig..."
aws eks update-kubeconfig --region "$REGION" --name "$CLUSTER_NAME"

echo "Replacing ACCOUNT_ID/registry placeholder in manifests..."
TEMP_DIR=$(mktemp -d)
cp "${K8S_DIR}"/*.yaml "${TEMP_DIR}/"
# Match the placeholder registry host regardless of the region segment.
sed -i.bak -E "s|ACCOUNT_ID\.dkr\.ecr\.[a-z0-9-]+\.amazonaws\.com|${REGISTRY}|g" "${TEMP_DIR}"/*.yaml
rm -f "${TEMP_DIR}"/*.bak

echo "Applying manifests in order..."
kubectl apply -f "${TEMP_DIR}/00-namespace.yaml"
kubectl apply -f "${TEMP_DIR}/01-configmap.yaml"
kubectl apply -f "${TEMP_DIR}/02-secrets.yaml"

echo "Deploying application workloads..."
kubectl apply -f "${TEMP_DIR}/10-backend.yaml"
kubectl apply -f "${TEMP_DIR}/12-frontend.yaml"
kubectl apply -f "${TEMP_DIR}/13-mem0.yaml"
kubectl apply -f "${TEMP_DIR}/16-mock-erp.yaml"
kubectl apply -f "${TEMP_DIR}/17-prometheus.yaml"
kubectl apply -f "${TEMP_DIR}/18-grafana.yaml"
kubectl apply -f "${TEMP_DIR}/19-ingress.yaml"

echo "Waiting for rollouts..."
kubectl rollout status deployment/backend -n "${NS}" --timeout=120s
kubectl rollout status deployment/frontend -n "${NS}" --timeout=120s

echo "Cleaning up temp dir..."
rm -rf "${TEMP_DIR}"

echo ""
echo "=== Deployment complete ==="
echo "Run: kubectl get ingress -n ${NS}  to get the ALB URL"
echo "Run: kubectl get pods -n ${NS}     to check pod status"
