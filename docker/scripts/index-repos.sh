#!/bin/bash
set -euo pipefail

REPOS_DIR="${1:-/repos}"

# ChunkHound v4 uses CHUNKHOUND_EMBEDDING_API_KEY (not OPENAI_API_KEY)
export CHUNKHOUND_EMBEDDING_API_KEY="${CHUNKHOUND_EMBEDDING_API_KEY:-${OPENAI_API_KEY}}"

echo "=== Indexing repos with ChunkHound ==="

# Check that repos exist before iterating
shopt -s nullglob
REPO_DIRS=("${REPOS_DIR}"/*/)
shopt -u nullglob

if [ ${#REPO_DIRS[@]} -eq 0 ]; then
  echo "ERROR: No repos found in ${REPOS_DIR}. Clone step may have failed."
  exit 1
fi

for repo_dir in "${REPO_DIRS[@]}"; do
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
  if chunkhound index . 2>&1; then
    echo "  Indexed $repo_name successfully"
  else
    echo "  WARNING: Failed to index $repo_name — skipping"
  fi
done

echo "=== Indexing complete ==="
