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
      "maxTurns": 30,
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
      "idleMinutes": 60
    },
    "maintenance": {
      "pruneAfter": "7d",
      "maxEntries": 100
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
# Clean up stale locks from prior crashed containers (mkdir is atomic, so the
# lock race is still safe even if all containers clean up simultaneously)
if [ -d "$LOCK_DIR" ]; then
  LOCK_AGE=$(( $(date +%s) - $(stat -c %Y "$LOCK_DIR" 2>/dev/null || echo "0") ))
  if [ "$LOCK_AGE" -gt 30 ]; then
    echo "=== [LOCK] Removing stale lock (${LOCK_AGE}s old) ==="
    rmdir "$LOCK_DIR" 2>/dev/null || true
  fi
fi
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
      bd init --force --from-jsonl --prefix memory --quiet 2>/dev/null || bd init --force --prefix memory --quiet
      git add -A && git commit -q -m "Reimport beads memory graph from JSONL (Dolt DB restored)" 2>/dev/null || true
      git push origin HEAD 2>/dev/null || echo "WARNING: Could not push reimported graph to remote"
      echo "Reimported beads graph from JSONL export"
    else
      echo "WARNING: No JSONL export found either — reinitializing fresh"
      rm -rf "$MEMORY_REPO/.beads"
      bd init --force --prefix memory --quiet
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
  # Ensure beads runtime files are gitignored (prevents merge conflicts on git pull)
  cd "$MEMORY_REPO"
  if ! grep -q "dolt-monitor.pid" .beads/.gitignore 2>/dev/null; then
    cat >> .beads/.gitignore << 'GITIGNORE'
dolt-monitor.pid
dolt-server.activity
dolt/
GITIGNORE
    git add .beads/.gitignore
    git commit -q -m "Ignore beads runtime files" 2>/dev/null || true
  fi
  cd /workspace

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

# Clean up stale thread turn logs (older than 7 days)
find /workspace/threads -name "turn-*.md" -mtime +7 -delete 2>/dev/null || true
find /workspace/threads -name "turns.jsonl" -mtime +7 -delete 2>/dev/null || true
find /workspace/threads -mindepth 1 -maxdepth 1 -type d -empty -delete 2>/dev/null || true

# Staggered nightly refresh — each expert refreshes at a different hour to avoid
# slamming OpenAI's embedding API. Repos are freshly indexed at build time,
# so this only catches code changes that happen while containers are running.
REFRESH_HOURS="ron:3 ben:4 leslie:5 tom:6 ann:7 april:8"
MY_HOUR=""
for entry in $REFRESH_HOURS; do
  name="${entry%%:*}"
  hour="${entry##*:}"
  if [ "$name" = "${EXPERT_NAME:-ron}" ]; then
    MY_HOUR="$hour"
    break
  fi
done

if [ -n "$MY_HOUR" ]; then
  echo "=== Scheduled refresh at $(printf '%02d' "$MY_HOUR"):00 UTC ==="
  (
    while true; do
      CURRENT_HOUR=$(date -u +%H)
      if [ "$CURRENT_HOUR" = "$(printf '%02d' "$MY_HOUR")" ]; then
        echo "=== [$(date -u)] Starting scheduled refresh for ${EXPERT_NAME} ==="
        refresh-repos 2>&1 | tee /workspace/refresh.log
        echo "=== [$(date -u)] Refresh complete ===" >> /workspace/refresh.log
        sleep 3600  # sleep 1h to avoid re-triggering in the same hour
      fi
      sleep 300  # check every 5 minutes
    done
  ) &
fi

# Start OpenClaw gateway
echo "=== Launching ${EXPERT_NAME:-swanson} (OpenClaw gateway) on port 18789 ==="
exec openclaw gateway --port 18789 --verbose
