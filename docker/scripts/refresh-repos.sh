#!/bin/bash
set -euo pipefail

REPOS_DIR="${1:-/workspace/repos}"

echo "=== Refreshing repos: git pull + re-index ==="

# Temporarily make repos writable for pull + re-index
chmod -R u+w "${REPOS_DIR}"

for repo_dir in "${REPOS_DIR}"/*/; do
	repo_name=$(basename "$repo_dir")
	echo "--- ${repo_name} ---"

	cd "$repo_dir"

	# Pull latest
	if git pull --ff-only 2>&1; then
		echo "  Pulled latest for ${repo_name}"
	else
		echo "  WARNING: git pull failed for ${repo_name} — skipping pull"
	fi

	# Re-index with ChunkHound
	if chunkhound index . 2>&1; then
		echo "  Re-indexed ${repo_name}"
	else
		echo "  WARNING: Failed to re-index ${repo_name}"
	fi
done

# Restore read-only
chmod -R a-w "${REPOS_DIR}"

echo "=== Refresh complete ==="
