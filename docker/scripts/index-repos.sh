#!/bin/bash
set -euo pipefail

REPOS_DIR="${1:-/repos}"

echo "=== Indexing repos with ChunkHound ==="

for repo_dir in "${REPOS_DIR}"/*/; do
  repo_name=$(basename "$repo_dir")
  echo "--- Indexing $repo_name ---"

  cd "$repo_dir"

  # Initialize ChunkHound config if not present
  if [ ! -f ".chunkhound.json" ]; then
    cat > .chunkhound.json << 'CHEOF'
{
  "embedding": {
    "model": "text-embedding-3-small",
    "dimensions": 512
  },
  "ignore": [
    "node_modules",
    ".git",
    "dist",
    "dist-electron",
    "release",
    "coverage",
    "*.min.js",
    "*.map",
    "package-lock.json"
  ]
}
CHEOF
  fi

  # Run indexing
  if chunkhound index . 2>/dev/null; then
    echo "  Indexed $repo_name successfully"
  else
    echo "  WARNING: Failed to index $repo_name — skipping"
  fi
done

echo "=== Indexing complete ==="
