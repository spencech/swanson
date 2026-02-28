#!/usr/bin/env bash
# query-mysql — Read-only MySQL wrapper with safety rails
# Usage: query-mysql [--format table|csv] [--limit N] "SQL QUERY"

set -euo pipefail

# ── Defaults ──────────────────────────────────────────────────────────────────
FORMAT="table"
LIMIT=100
MAX_LIMIT=1000
MAX_QUERY_LEN=4096
TIMEOUT=30

# ── Parse flags ───────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
	case "$1" in
		--format)
			FORMAT="$2"; shift 2 ;;
		--limit)
			LIMIT="$2"; shift 2 ;;
		--help|-h)
			cat <<'USAGE'
Usage: query-mysql [OPTIONS] "SQL QUERY"

Options:
  --format table|csv   Output format (default: table)
  --limit N            Max rows to return (default: 100, max: 1000)
  -h, --help           Show this help

Environment variables (required):
  MYSQL_HOST       Database hostname
  MYSQL_USER       Database username
  MYSQL_PASSWORD   Database password
  MYSQL_DATABASE   Database name
  MYSQL_PORT       Database port (default: 3306)

Examples:
  query-mysql "SELECT COUNT(*) FROM users"
  query-mysql --format csv --limit 50 "SELECT id, name FROM districts"
  query-mysql "SHOW TABLES"
  query-mysql "DESCRIBE users"
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

QUERY="${1:-}"

# ── Validate environment ─────────────────────────────────────────────────────
if [[ -z "${MYSQL_HOST:-}" || -z "${MYSQL_USER:-}" || -z "${MYSQL_PASSWORD:-}" || -z "${MYSQL_DATABASE:-}" ]]; then
	echo "Error: Required environment variables not set." >&2
	echo "Need: MYSQL_HOST, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE" >&2
	exit 1
fi

# ── Validate query ────────────────────────────────────────────────────────────
if [[ -z "$QUERY" ]]; then
	echo "Error: No query provided." >&2
	echo "Usage: query-mysql [--format table|csv] [--limit N] \"SQL QUERY\"" >&2
	exit 1
fi

if [[ ${#QUERY} -gt $MAX_QUERY_LEN ]]; then
	echo "Error: Query exceeds maximum length of $MAX_QUERY_LEN characters." >&2
	exit 1
fi

# Block multi-statement queries (semicolons not at end)
TRIMMED="${QUERY%;}"          # strip trailing semicolon
TRIMMED="${TRIMMED%"${TRIMMED##*[![:space:]]}"}"  # strip trailing whitespace before ;
if [[ "$TRIMMED" == *";"* ]]; then
	echo "Error: Multi-statement queries are not allowed." >&2
	exit 1
fi

# Normalize to uppercase for keyword checking
UPPER_QUERY="$(echo "$QUERY" | tr '[:lower:]' '[:upper:]')"

# Allow only safe operations
ALLOWED=0
for keyword in SELECT SHOW DESCRIBE EXPLAIN WITH; do
	if [[ "$UPPER_QUERY" =~ ^[[:space:]]*${keyword}[[:space:]] ]] || [[ "$UPPER_QUERY" =~ ^[[:space:]]*${keyword}$ ]]; then
		ALLOWED=1
		break
	fi
done

if [[ $ALLOWED -eq 0 ]]; then
	echo "Error: Only SELECT, SHOW, DESCRIBE, EXPLAIN, and WITH (CTE) queries are allowed." >&2
	exit 1
fi

# Block dangerous clauses even in SELECT
for blocked in "INSERT " "UPDATE " "DELETE " "DROP " "ALTER " "TRUNCATE " "CREATE " "GRANT " "REVOKE " "INTO OUTFILE" "INTO DUMPFILE" "FOR UPDATE" "LOCK "; do
	if [[ "$UPPER_QUERY" == *"$blocked"* ]]; then
		echo "Error: Query contains blocked keyword: $blocked" >&2
		exit 1
	fi
done

# ── Validate and cap limit ───────────────────────────────────────────────────
if ! [[ "$LIMIT" =~ ^[0-9]+$ ]] || [[ "$LIMIT" -lt 1 ]]; then
	echo "Error: --limit must be a positive integer." >&2
	exit 1
fi

if [[ "$LIMIT" -gt "$MAX_LIMIT" ]]; then
	echo "Warning: Limit capped to $MAX_LIMIT rows." >&2
	LIMIT=$MAX_LIMIT
fi

# Auto-append LIMIT if the query is a SELECT/WITH and doesn't already have one
if [[ "$UPPER_QUERY" =~ ^[[:space:]]*(SELECT|WITH) ]] && ! [[ "$UPPER_QUERY" =~ LIMIT[[:space:]]+[0-9] ]]; then
	QUERY="${QUERY%%;} LIMIT $LIMIT"
fi

# ── Validate format ──────────────────────────────────────────────────────────
if [[ "$FORMAT" != "table" && "$FORMAT" != "csv" ]]; then
	echo "Error: --format must be 'table' or 'csv'." >&2
	exit 1
fi

# ── Build mysql command ───────────────────────────────────────────────────────
export MYSQL_PWD="$MYSQL_PASSWORD"

MYSQL_ARGS=(
	-h "$MYSQL_HOST"
	-P "${MYSQL_PORT:-3306}"
	-u "$MYSQL_USER"
	"$MYSQL_DATABASE"
	-e "$QUERY"
)

if [[ "$FORMAT" == "table" ]]; then
	MYSQL_ARGS+=(--table)
else
	MYSQL_ARGS+=(--batch --raw)
fi

# ── Execute with timeout ─────────────────────────────────────────────────────
if [[ "$FORMAT" == "csv" ]]; then
	timeout "$TIMEOUT" mysql "${MYSQL_ARGS[@]}" | sed 's/\t/,/g'
else
	timeout "$TIMEOUT" mysql "${MYSQL_ARGS[@]}"
fi

EXIT_CODE=$?
if [[ $EXIT_CODE -eq 124 ]]; then
	echo "Error: Query timed out after ${TIMEOUT}s." >&2
	exit 1
fi

exit $EXIT_CODE
