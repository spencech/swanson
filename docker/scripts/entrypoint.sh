#!/bin/bash
set -euo pipefail

echo "=== Starting Swanson (OpenClaw Gateway) ==="

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
        "primary": "anthropic/claude-sonnet-4-6"
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

# Configure git identity for push operations
cd "$MEMORY_REPO"
git config user.email "swanson@teachupbeat.com"
git config user.name "Swanson Agent"

# Unshallow the clone so bd sync can push (clone-repos uses --depth 1)
git fetch --unshallow 2>/dev/null || true

# Initialize beads memory graph if not already present
if [ ! -d "$MEMORY_REPO/.beads" ]; then
  echo "=== Initializing beads memory graph in swanson-db ==="
  bd init --prefix memory --quiet
  bd kv set "memory.version" "1.0.0"
  bd kv set "memory.initialized" "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  bd kv set "memory.last_consolidation" "never"
  git add -A && git commit -q -m "Initialize beads memory graph"
  git push origin HEAD 2>/dev/null || echo "WARNING: Could not push beads init to remote"
  echo "Beads memory graph initialized in swanson-db"
else
  echo "Beads memory graph found in swanson-db"
  bd sync 2>/dev/null || true
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
echo "=== Launching OpenClaw gateway on port 18789 ==="
exec openclaw gateway --port 18789 --verbose
