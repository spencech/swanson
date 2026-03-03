#!/bin/bash
set -euo pipefail

echo "=== Starting expert: ${EXPERT_NAME:-swanson} (OpenClaw Gateway) ==="

# Ensure OpenClaw config directory exists
OPENCLAW_HOME="${HOME}/.openclaw"
mkdir -p "${OPENCLAW_HOME}"

# Write OpenClaw configuration
cat > "${OPENCLAW_HOME}/openclaw.json" << EOF
{
  "gateway": {
    "port": 18789,
    "bind": "lan",
    "mode": "local",
    "controlUi": {
      "dangerouslyAllowHostHeaderOriginFallback": true,
      "dangerouslyDisableDeviceAuth": true
    },
    "auth": {
      "mode": "token",
      "token": "${OPENCLAW_GATEWAY_TOKEN:-swanson-dev-token}"
    }
  },
  "agents": {
    "defaults": {
      "model": {
        "primary": "anthropic/claude-opus-4-6"
      },
      "workspace": "/workspace",
      "repoRoot": "/workspace/repos"
    }
  },
  "plugins": {
    "enabled": true,
    "allow": ["swanson-tools"],
    "load": {
      "paths": ["/workspace/extensions"]
    }
  },
  "tools": {
    "profile": "coding"
  },
  "session": {
    "reset": {
      "mode": "idle",
      "idleMinutes": 480
    },
    "maintenance": {
      "pruneAfter": "30d",
      "maxEntries": 500
    }
  }
}
EOF

echo "OpenClaw config written to ${OPENCLAW_HOME}/openclaw.json"

# Make swanson-db writable for memory graph operations
MEMORY_REPO="/workspace/repos/swanson-db"
chmod -R u+w "$MEMORY_REPO"
export BD_ACTOR="swanson-agent"

# Verify Dolt is installed (hard fail — memory system requires it)
if ! command -v dolt &>/dev/null; then
  echo "FATAL: Dolt binary not found. Episodic memory requires Dolt."
  echo "The Docker image must install Dolt. Cannot start without it."
  exit 1
fi
echo "Dolt version: $(dolt version | head -1)"

# Configure git identity for push operations
cd "$MEMORY_REPO"
git config user.email "${EXPERT_NAME:-swanson}@teachupbeat.com"
git config user.name "${EXPERT_NAME:-Swanson} Agent"

# Unshallow the clone so bd sync can push (clone-repos uses --depth 1)
git fetch --unshallow 2>/dev/null || true

# Clean up any no-db workaround from prior failed starts
if [ -f "$MEMORY_REPO/.beads/config.json" ]; then
  sed -i 's/"no-db":\s*true/"no-db": false/g' "$MEMORY_REPO/.beads/config.json" 2>/dev/null || true
fi

# Lockfile guard: when multiple expert containers start simultaneously,
# only one should initialize beads
# Use a shared volume path so the lock works across containers
LOCK_DIR="/workspace/threads/.beads-init-lock"
LOCK_ACQUIRED=false
if mkdir "$LOCK_DIR" 2>/dev/null; then
  LOCK_ACQUIRED=true
  echo "=== [LOCK] Acquired beads init lock ==="
else
  echo "=== [WAIT] Another container is initializing beads — waiting ==="
  WAIT_COUNT=0
  while [ -d "$LOCK_DIR" ] && [ $WAIT_COUNT -lt 60 ]; do
    sleep 1
    WAIT_COUNT=$((WAIT_COUNT + 1))
  done
  if [ -d "$LOCK_DIR" ]; then
    echo "WARNING: Lock held for 60s — removing stale lock"
    rmdir "$LOCK_DIR" 2>/dev/null || true
  fi
  echo "=== [WAIT] Init lock released, proceeding ==="
fi

# Three-state beads initialization:
#   1. Brand new: no .beads/ at all → full init
#   2. Fresh container (Dolt DB lost): .beads/ exists but no .beads/dolt/ → reimport from JSONL
#   3. Running container: .beads/ and .beads/dolt/ both exist → sync
if [ "$LOCK_ACQUIRED" = true ]; then
  if [ ! -d "$MEMORY_REPO/.beads" ]; then
    echo "=== [INIT] Initializing beads memory graph in swanson-db ==="
    bd init --prefix memory --quiet
    bd kv set "memory.version" "1.0.0"
    bd kv set "memory.initialized" "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    bd kv set "memory.last_consolidation" "never"
    git add -A && git commit -q -m "Initialize beads memory graph"
    git push origin HEAD 2>/dev/null || echo "WARNING: Could not push beads init to remote"
    echo "Beads memory graph initialized in swanson-db"
  elif [ ! -d "$MEMORY_REPO/.beads/dolt" ]; then
    echo "=== [REIMPORT] Beads directory found but Dolt DB missing — reimporting from JSONL ==="
    if [ -f "$MEMORY_REPO/.beads/issues.jsonl" ]; then
      bd init --from-jsonl --prefix memory --quiet 2>/dev/null || bd init --prefix memory --quiet
      git add -A && git commit -q -m "Reimport beads memory graph from JSONL (Dolt DB restored)" 2>/dev/null || true
      git push origin HEAD 2>/dev/null || echo "WARNING: Could not push reimported graph to remote"
      echo "Reimported beads graph from JSONL export"
    else
      echo "WARNING: No JSONL export found either — reinitializing fresh"
      rm -rf "$MEMORY_REPO/.beads"
      bd init --prefix memory --quiet
      bd kv set "memory.version" "1.0.0"
      bd kv set "memory.initialized" "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
      bd kv set "memory.last_consolidation" "never"
      git add -A && git commit -q -m "Reinitialize beads memory graph (Dolt DB lost)"
      git push origin HEAD 2>/dev/null || echo "WARNING: Could not push beads reinit to remote"
    fi
  else
    echo "=== [SYNC] Beads memory graph found with Dolt DB intact ==="
    bd sync 2>/dev/null || true
  fi
  # Release lock
  rmdir "$LOCK_DIR" 2>/dev/null || true
  echo "=== [LOCK] Released beads init lock ==="
else
  echo "=== [SKIP] Beads initialization handled by another container ==="
  # Still sync to get latest state
  bd sync 2>/dev/null || true
fi

# Health check: verify beads is functional
OPEN_COUNT=$(bd list --status=open 2>/dev/null | wc -l || echo "FAILED")
if [ "$OPEN_COUNT" = "FAILED" ] || [ -z "$OPEN_COUNT" ]; then
  echo "WARNING: Beads health check failed — memory operations may not work"
else
  echo "Beads OK: ${OPEN_COUNT} open memories"
fi
cd /workspace

# Decode CloudFront signing key from base64 env var (if configured)
CF_KEY_PATH="/tmp/cf-private-key.pem"
if [[ -n "${CF_PRIVATE_KEY_B64:-}" ]]; then
  echo "$CF_PRIVATE_KEY_B64" | base64 -d > "$CF_KEY_PATH" 2>/dev/null
  if [[ -s "$CF_KEY_PATH" ]] && head -1 "$CF_KEY_PATH" | grep -q "BEGIN"; then
    chmod 600 "$CF_KEY_PATH"
    echo "CloudFront signing key decoded to ${CF_KEY_PATH}"
  else
    echo "WARNING: CF_PRIVATE_KEY_B64 is set but failed to decode — cdn-sign will not work"
    rm -f "$CF_KEY_PATH"
  fi
else
  echo "CloudFront signing not configured (CF_PRIVATE_KEY_B64 not set)"
fi

# Verify repos are present
REPO_COUNT=$(ls -1d /workspace/repos/*/ 2>/dev/null | wc -l)
echo "Repos available: ${REPO_COUNT}"

# Verify ChunkHound indexes
INDEX_COUNT=$(find /workspace/repos -name ".chunkhound" -type d 2>/dev/null | wc -l)
echo "ChunkHound indexes: ${INDEX_COUNT}"

# Verify persistence directories are writable
for dir in threads plans sessions; do
  if [ -w "/workspace/${dir}" ]; then
    echo "  /workspace/${dir} — writable"
  else
    echo "  WARNING: /workspace/${dir} — not writable"
  fi
done

# Pull latest code for all repos in the background (non-blocking)
# Repos are baked into the image at build time — this keeps them current at runtime.
# Logs go to /workspace/refresh.log so the agent can report on the last refresh.
echo "=== Triggering background repo refresh ==="
(
  refresh-repos 2>&1 | tee /workspace/refresh.log
  echo "=== Background repo refresh complete ===" >> /workspace/refresh.log
) &

# Start OpenClaw gateway
echo "=== Launching ${EXPERT_NAME:-swanson} (OpenClaw gateway) on port 18789 ==="
exec openclaw gateway --port 18789 --verbose
