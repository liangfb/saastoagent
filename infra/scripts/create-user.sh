#!/usr/bin/env bash
#
# create-user.sh — create a login user in the Agentic Service Mesh database.
#
# This is an operator-only tool. It runs OUTSIDE the application image: it
# `kubectl exec`s into a backend pod (the only place the private RDS instance
# is reachable) and reuses the app's compiled password hashing utility so the
# stored hash format matches exactly what the auth service verifies against.
#
# Usage:
#   ./infra/scripts/create-user.sh --username alice
#   ./infra/scripts/create-user.sh --username alice --password s3cret
#
# Options:
#   --username <name>      Required. Username to create.
#   --password <password>  Optional. If omitted, a random password is generated
#                          and printed once.
#   --namespace <ns>       K8s namespace (default: agentic-mesh).
#   --help                 Show this help.
#
# Behavior:
#   - Fails if the username already exists.
#   - Password is hashed with scrypt (salted) before storage.
#
set -euo pipefail

NS="agentic-mesh"
USERNAME=""
PASSWORD=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --username) USERNAME="${2:-}"; shift 2 ;;
    --password) PASSWORD="${2:-}"; shift 2 ;;
    --namespace) NS="${2:-}"; shift 2 ;;
    --help)
      sed -n '2,28p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

if [[ -z "$USERNAME" ]]; then
  echo "Error: --username is required." >&2
  echo "Usage: $0 --username <name> [--password <password>] [--namespace <ns>]" >&2
  exit 1
fi

# Locate a running backend pod (RDS is only reachable from inside the cluster).
POD="$(kubectl get pods -n "$NS" -l app=backend \
  --field-selector=status.phase=Running \
  -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || true)"

if [[ -z "$POD" ]]; then
  echo "Error: no running backend pod found in namespace '$NS'." >&2
  exit 1
fi

echo "Using backend pod: $POD (namespace: $NS)"

# Feed the credentials to the remote node process over stdin as a single JSON
# line. This keeps the password out of the pod's argv/env (and out of any
# process listing). The remote node process reuses the app's compiled
# password.util for hash-format parity with the auth service.
REMOTE_SCRIPT='
const { randomBytes } = require("crypto");
const { PrismaClient } = require("@prisma/client");

function loadHashUtil() {
  for (const p of ["/app/dist/core/utils/password.util", "/app/dist/src/core/utils/password.util"]) {
    try { return require(p); } catch (e) { if (e.code !== "MODULE_NOT_FOUND") throw e; }
  }
  throw new Error("Could not locate compiled password.util in the image.");
}

function readStdin() {
  return new Promise((resolve) => {
    let buf = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => (buf += c));
    process.stdin.on("end", () => resolve(buf));
  });
}

(async () => {
  const input = JSON.parse((await readStdin()).trim() || "{}");
  const username = (input.username || "").trim();
  if (!username) { console.error("Error: username is empty."); process.exit(1); }

  const { hashPassword } = loadHashUtil();
  const prisma = new PrismaClient();
  try {
    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) { console.error(`Error: user "${username}" already exists.`); process.exit(1); }

    const provided = input.password || "";
    const generated = provided.length === 0;
    const password = generated ? randomBytes(12).toString("base64url") : provided;

    const user = await prisma.user.create({
      data: { username, passwordHash: hashPassword(password) },
    });
    console.log(`Created user "${user.username}" (id=${user.id}).`);
    if (generated) {
      console.log(`Generated password: ${password}`);
      console.log("Store it now — it will not be shown again.");
    }
  } finally {
    await prisma.$disconnect();
  }
})().catch((err) => { console.error(err.message || err); process.exit(1); });
'

# Build the JSON payload safely (handles quotes/backslashes in the password).
PAYLOAD="$(USERNAME="$USERNAME" PASSWORD="$PASSWORD" node -e \
  'process.stdout.write(JSON.stringify({username:process.env.USERNAME,password:process.env.PASSWORD}))' \
  2>/dev/null || printf '{"username":"%s","password":"%s"}' "$USERNAME" "$PASSWORD")"

printf '%s' "$PAYLOAD" | kubectl exec -i -n "$NS" "$POD" -- node -e "$REMOTE_SCRIPT"
