#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Load deploy config from infra/.env if present (see infra/.env.example).
ENV_FILE="${SCRIPT_DIR}/../.env"
if [ -f "${ENV_FILE}" ]; then
  set -a; . "${ENV_FILE}"; set +a
fi

REGION="${AWS_REGION:-us-west-2}"
ACCOUNT_ID="${AWS_ACCOUNT_ID:-$(aws sts get-caller-identity --query Account --output text)}"
REGISTRY="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"
TAG="${1:-latest}"
# Service directories live at the repo root (no src/ wrapper).
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

echo "Logging into ECR..."
aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "$REGISTRY"

echo "Building and pushing images with tag: ${TAG}"

# EKS nodes are x86_64 — always build with --platform linux/amd64.
echo "==> backend"
docker build --platform linux/amd64 -t "${REGISTRY}/agentic-mesh/backend:${TAG}" "${PROJECT_ROOT}/backend"
docker push "${REGISTRY}/agentic-mesh/backend:${TAG}"

echo "==> frontend"
docker build --platform linux/amd64 -t "${REGISTRY}/agentic-mesh/frontend:${TAG}" "${PROJECT_ROOT}/frontend"
docker push "${REGISTRY}/agentic-mesh/frontend:${TAG}"

echo "==> mem0-server"
docker build --platform linux/amd64 -t "${REGISTRY}/agentic-mesh/mem0-server:${TAG}" "${PROJECT_ROOT}/mem0-server"
docker push "${REGISTRY}/agentic-mesh/mem0-server:${TAG}"

echo "==> mock-erp"
docker build --platform linux/amd64 -t "${REGISTRY}/agentic-mesh/mock-erp:${TAG}" "${PROJECT_ROOT}/mock-erp"
docker push "${REGISTRY}/agentic-mesh/mock-erp:${TAG}"

echo "==> mcp-runtime"
docker build --platform linux/amd64 -t "${REGISTRY}/agentic-mesh-dev-mcp-runtime:${TAG}" "${PROJECT_ROOT}/mcp-runtime"
docker push "${REGISTRY}/agentic-mesh-dev-mcp-runtime:${TAG}"

echo "All images pushed successfully."
