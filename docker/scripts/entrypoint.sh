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

# Initialize knowledge repo if not present
if [ ! -f "/workspace/knowledge/KNOWLEDGE.md" ]; then
  cat > /workspace/knowledge/KNOWLEDGE.md << 'KEOF'
# Swanson Knowledge Base

Persistent knowledge about the Upbeat ecosystem. Entries are added by users and the agent.
Each entry includes a category, timestamp, and description.

---

KEOF
  cd /workspace/knowledge
  git init -q
  git add -A
  git commit -q -m "Initialize knowledge base"
  cd /workspace
  echo "Knowledge base initialized at /workspace/knowledge/"
else
  echo "Knowledge base found at /workspace/knowledge/"
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

# Start OpenClaw gateway
echo "=== Launching OpenClaw gateway on port 18789 ==="
exec openclaw gateway --port 18789 --verbose
