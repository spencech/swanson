#!/usr/bin/env bash
# cdn-sign — Generate CloudFront signed URLs for CDN resources
# Usage: cdn-sign [--expires N] "RESOURCE_PATH"

set -euo pipefail

# ── Defaults ──────────────────────────────────────────────────────────────────
EXPIRES=3600
MAX_EXPIRES=604800
CF_KEY_PATH="/tmp/cf-private-key.pem"

# ── Parse flags ───────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
	case "$1" in
		--expires)
			EXPIRES="$2"; shift 2 ;;
		--help|-h)
			cat <<'USAGE'
Usage: cdn-sign [OPTIONS] "RESOURCE_PATH"

Generate a CloudFront signed download URL for a file on the Upbeat CDN.

Options:
  --expires N    URL validity in seconds (default: 3600 = 1 hour, max: 604800 = 7 days)
  -h, --help     Show this help

Environment variables (required):
  CF_DOMAIN           CloudFront distribution domain (e.g., cdn.teachupbeat.com)
  CF_KEY_PAIR_ID      CloudFront key pair ID

The private signing key must exist at /tmp/cf-private-key.pem
(decoded from CF_PRIVATE_KEY_B64 at container startup).

Examples:
  cdn-sign "resources/31/appreciation-toolkit.pdf"
  cdn-sign --expires 86400 "resources/28/planning-to-build-trust-activities-resource.pdf"
  cdn-sign "resources/72/teacher-voice-toolkit.pdf"
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

RESOURCE_PATH="${1:-}"

# ── Validate environment ─────────────────────────────────────────────────────
if [[ -z "${CF_DOMAIN:-}" ]]; then
	echo "Error: CF_DOMAIN environment variable not set." >&2
	exit 1
fi

if [[ -z "${CF_KEY_PAIR_ID:-}" ]]; then
	echo "Error: CF_KEY_PAIR_ID environment variable not set." >&2
	exit 1
fi

if [[ ! -f "$CF_KEY_PATH" ]]; then
	echo "Error: CloudFront private key not found at ${CF_KEY_PATH}." >&2
	echo "Check that CF_PRIVATE_KEY_B64 is set in the environment." >&2
	exit 1
fi

# ── Validate resource path ───────────────────────────────────────────────────
if [[ -z "$RESOURCE_PATH" ]]; then
	echo "Error: No resource path provided." >&2
	echo "Usage: cdn-sign [--expires N] \"RESOURCE_PATH\"" >&2
	exit 1
fi

# Strip leading slash if present
RESOURCE_PATH="${RESOURCE_PATH#/}"

# ── Validate expiry ──────────────────────────────────────────────────────────
if ! [[ "$EXPIRES" =~ ^[0-9]+$ ]] || [[ "$EXPIRES" -lt 1 ]]; then
	echo "Error: --expires must be a positive integer." >&2
	exit 1
fi

if [[ "$EXPIRES" -gt "$MAX_EXPIRES" ]]; then
	echo "Warning: Expiry capped to $MAX_EXPIRES seconds (7 days)." >&2
	EXPIRES=$MAX_EXPIRES
fi

# ── Generate CloudFront canned policy signed URL via OpenSSL ─────────────────
URL="https://${CF_DOMAIN}/${RESOURCE_PATH}"
EXPIRY_EPOCH=$(( $(date +%s) + EXPIRES ))

# Canned policy JSON (no whitespace — CloudFront is strict about this)
POLICY="{\"Statement\":[{\"Resource\":\"${URL}\",\"Condition\":{\"DateLessThan\":{\"AWS:EpochTime\":${EXPIRY_EPOCH}}}}]}"

# Sign the policy with RSA-SHA1, then convert to CloudFront's URL-safe base64
SIGNATURE=$(echo -n "$POLICY" \
	| openssl dgst -sha1 -sign "$CF_KEY_PATH" \
	| openssl base64 -A \
	| tr '+/=' '-~_')

echo "${URL}?Expires=${EXPIRY_EPOCH}&Signature=${SIGNATURE}&Key-Pair-Id=${CF_KEY_PAIR_ID}"
