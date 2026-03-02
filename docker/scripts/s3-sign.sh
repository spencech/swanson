#!/usr/bin/env bash
# s3-sign — Generate presigned S3 URLs for CDN resources
# Usage: s3-sign [--expires N] "S3_KEY"

set -euo pipefail

# ── Defaults ──────────────────────────────────────────────────────────────────
EXPIRES=3600
MAX_EXPIRES=604800

# ── Parse flags ───────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
	case "$1" in
		--expires)
			EXPIRES="$2"; shift 2 ;;
		--help|-h)
			cat <<'USAGE'
Usage: s3-sign [OPTIONS] "S3_KEY"

Generate a presigned download URL for a file in the Upbeat CDN bucket.

Options:
  --expires N    URL validity in seconds (default: 3600 = 1 hour, max: 604800 = 7 days)
  -h, --help     Show this help

Environment variables (required):
  S3_BUCKET              S3 bucket name
  AWS_ACCESS_KEY_ID      AWS credentials
  AWS_SECRET_ACCESS_KEY  AWS credentials
  AWS_REGION             AWS region (default: us-east-1)

Optional:
  AWS_SESSION_TOKEN      Required for temporary STS credentials

Examples:
  s3-sign "toolkit/appreciation-toolkit.pdf"
  s3-sign --expires 86400 "toolkit/31/learning-staff-languages-of-appreciation.pdf"
  s3-sign "research/literature-review-2.0.pdf"
USAGE
			exit 0
			;;
		--)
			shift; break ;;
		-*)
			echo "Error: Unknown option: $1" >&2; exit 1 ;;
		*)
			break ;;
	esac
done

KEY="${1:-}"

# ── Validate environment ─────────────────────────────────────────────────────
if [[ -z "${S3_BUCKET:-}" ]]; then
	echo "Error: S3_BUCKET environment variable not set." >&2
	exit 1
fi

if [[ -z "${AWS_ACCESS_KEY_ID:-}" || -z "${AWS_SECRET_ACCESS_KEY:-}" ]]; then
	echo "Error: AWS credentials not set (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)." >&2
	exit 1
fi

# ── Validate key ──────────────────────────────────────────────────────────────
if [[ -z "$KEY" ]]; then
	echo "Error: No S3 key provided." >&2
	echo "Usage: s3-sign [--expires N] \"S3_KEY\"" >&2
	exit 1
fi

# Strip leading slash if present
KEY="${KEY#/}"

# ── Validate expiry ──────────────────────────────────────────────────────────
if ! [[ "$EXPIRES" =~ ^[0-9]+$ ]] || [[ "$EXPIRES" -lt 1 ]]; then
	echo "Error: --expires must be a positive integer." >&2
	exit 1
fi

if [[ "$EXPIRES" -gt "$MAX_EXPIRES" ]]; then
	echo "Warning: Expiry capped to $MAX_EXPIRES seconds (7 days)." >&2
	EXPIRES=$MAX_EXPIRES
fi

# ── Generate presigned URL ───────────────────────────────────────────────────
aws s3 presign "s3://${S3_BUCKET}/${KEY}" \
	--expires-in "$EXPIRES" \
	--region "${AWS_REGION:-us-east-1}"
