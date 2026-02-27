#!/bin/bash
set -euo pipefail

REPOS_DIR="${1:-/repos}"

# All 20 TeachUpbeat repositories
REPOS=(
  # Infrastructure & DevOps
  "upbeat-aws-infrastructure"
  "upbeat-cloudformation-json-stitcher"
  "upbeat-lambda-layers"
  # Web Applications
  "administrator-portal"
  "district-administrator"
  "reports-2.0"
  "upbeat-survey-administration"
  "survey-administrator"
  "user-administrator"
  # Backend Services
  "engagement-database"
  "survey"
  "datapacks"
  # Email & Notifications
  "upbeat-sendgrid-cognito"
  "lambda-sendgrid"
  "upbeat-sendgrid-webhook"
  "upbeat-sendgrid-websocket"
  # Utilities
  "pdf-generator"
  "google-presentations"
  # Tooling & Documentation
  "spawnee"
  "upbeat-documentation"
)

echo "=== Cloning ${#REPOS[@]} TeachUpbeat repositories (read-only) ==="

for repo in "${REPOS[@]}"; do
  echo "--- Cloning $repo ---"
  REPO_URL="https://${GITHUB_PAT}@github.com/TeachUpbeat/${repo}.git"
  REPO_PATH="${REPOS_DIR}/${repo}"

  # Try develop branch first, fall back to default branch
  if git clone --branch develop --single-branch --depth 1 "$REPO_URL" "$REPO_PATH" 2>&1; then
    echo "  Cloned $repo (develop branch)"
  elif git clone --depth 1 "$REPO_URL" "$REPO_PATH" 2>&1; then
    echo "  Cloned $repo (default branch)"
  else
    echo "  WARNING: Failed to clone $repo — skipping"
  fi
done

CLONED=$(ls -1d ${REPOS_DIR}/*/ 2>/dev/null | wc -l)
echo "=== Clone complete: ${CLONED} repos ==="

if [ "$CLONED" -eq 0 ]; then
  echo "ERROR: No repos were cloned. Check that GITHUB_PAT is valid and has access to TeachUpbeat org."
  exit 1
fi
