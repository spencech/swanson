#!/bin/bash
set -euo pipefail

REPOS_DIR="${1:-/repos}"

# All 11 TeachUpbeat repositories
REPOS=(
  "upbeat-aws-infrastructure"
  "engagement-database"
  "administrator-portal"
  "district-administrator"
  "reports-2.0"
  "upbeat-survey-administration"
  "survey-administrator"
  "user-administrator"
  "survey"
  "pdf-generator"
  "google-presentations"
)

echo "=== Cloning ${#REPOS[@]} TeachUpbeat repositories ==="

for repo in "${REPOS[@]}"; do
  echo "--- Cloning $repo ---"
  REPO_URL="https://${GITHUB_PAT}@github.com/TeachUpbeat/${repo}.git"
  REPO_PATH="${REPOS_DIR}/${repo}"

  # Try develop branch first, fall back to default branch
  if git clone --branch develop --single-branch --depth 1 "$REPO_URL" "$REPO_PATH" 2>/dev/null; then
    echo "  Cloned $repo (develop branch)"
  elif git clone --depth 1 "$REPO_URL" "$REPO_PATH" 2>/dev/null; then
    echo "  Cloned $repo (default branch)"
  else
    echo "  WARNING: Failed to clone $repo — skipping"
  fi
done

echo "=== Clone complete: $(ls -1d ${REPOS_DIR}/*/ 2>/dev/null | wc -l) repos ==="
