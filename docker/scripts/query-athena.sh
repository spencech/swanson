#!/usr/bin/env bash
# query-athena — Athena query wrapper with polling and timeout
# Usage: query-athena [--format table|csv] [--limit N] [--timeout N] "SQL QUERY"

set -euo pipefail

# ── Defaults ──────────────────────────────────────────────────────────────────
FORMAT="table"
LIMIT=100
MAX_LIMIT=1000
MAX_QUERY_LEN=4096
TIMEOUT=120
MAX_TIMEOUT=300
POLL_INTERVAL=2
WORKGROUP="AnalyticsWorkGroup-production"
DATABASE="analytics_production"

# ── Parse flags ───────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
	case "$1" in
		--format)
			FORMAT="$2"; shift 2 ;;
		--limit)
			LIMIT="$2"; shift 2 ;;
		--timeout)
			TIMEOUT="$2"; shift 2 ;;
		--help|-h)
			cat <<'USAGE'
Usage: query-athena [OPTIONS] "SQL QUERY"

Options:
  --format table|csv   Output format (default: table)
  --limit N            Max rows to return (default: 100, max: 1000)
  --timeout N          Query timeout in seconds (default: 120, max: 300)
  -h, --help           Show this help

Environment variables (required):
  AWS_ACCESS_KEY_ID       AWS access key
  AWS_SECRET_ACCESS_KEY   AWS secret key
  AWS_REGION              AWS region (default: us-east-1)

Database: analytics_production
WorkGroup: AnalyticsWorkGroup-production

Tables (quote with double quotes due to hyphens):
  "rds-users", "rds-districts", "rds-intervals",
  "rds-events", "rds-schools", "rds-networks"

Examples:
  query-athena 'SELECT * FROM "rds-users" LIMIT 5'
  query-athena --format csv 'SELECT COUNT(*) FROM "rds-districts"'
  query-athena --limit 500 'SELECT * FROM "rds-events" WHERE event_type = '\''survey_complete'\'''
  query-athena 'SHOW TABLES'
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
if [[ -z "${AWS_ACCESS_KEY_ID:-}" || -z "${AWS_SECRET_ACCESS_KEY:-}" ]]; then
	echo "Error: Required environment variables not set." >&2
	echo "Need: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY" >&2
	exit 1
fi

export AWS_DEFAULT_REGION="${AWS_REGION:-us-east-1}"

# ── Validate query ────────────────────────────────────────────────────────────
if [[ -z "$QUERY" ]]; then
	echo "Error: No query provided." >&2
	echo "Usage: query-athena [--format table|csv] [--limit N] [--timeout N] \"SQL QUERY\"" >&2
	exit 1
fi

if [[ ${#QUERY} -gt $MAX_QUERY_LEN ]]; then
	echo "Error: Query exceeds maximum length of $MAX_QUERY_LEN characters." >&2
	exit 1
fi

# Normalize to uppercase for keyword checking
UPPER_QUERY="$(echo "$QUERY" | tr '[:lower:]' '[:upper:]')"

# Allow only safe operations
ALLOWED=0
for keyword in SELECT SHOW DESCRIBE WITH; do
	if [[ "$UPPER_QUERY" =~ ^[[:space:]]*${keyword}[[:space:]] ]] || [[ "$UPPER_QUERY" =~ ^[[:space:]]*${keyword}$ ]]; then
		ALLOWED=1
		break
	fi
done

if [[ $ALLOWED -eq 0 ]]; then
	echo "Error: Only SELECT, SHOW, DESCRIBE, and WITH (CTE) queries are allowed." >&2
	exit 1
fi

# Block dangerous clauses
for blocked in "INSERT " "UPDATE " "DELETE " "DROP " "ALTER " "TRUNCATE " "CREATE " "GRANT " "REVOKE "; do
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

# ── Validate timeout ─────────────────────────────────────────────────────────
if ! [[ "$TIMEOUT" =~ ^[0-9]+$ ]] || [[ "$TIMEOUT" -lt 1 ]]; then
	echo "Error: --timeout must be a positive integer." >&2
	exit 1
fi

if [[ "$TIMEOUT" -gt "$MAX_TIMEOUT" ]]; then
	echo "Warning: Timeout capped to ${MAX_TIMEOUT}s." >&2
	TIMEOUT=$MAX_TIMEOUT
fi

# ── Validate format ──────────────────────────────────────────────────────────
if [[ "$FORMAT" != "table" && "$FORMAT" != "csv" ]]; then
	echo "Error: --format must be 'table' or 'csv'." >&2
	exit 1
fi

# ── S3 output location ───────────────────────────────────────────────────────
OUTPUT_LOCATION="s3://aws-athena-query-results-${AWS_DEFAULT_REGION}/swanson/"

# ── Start query execution ────────────────────────────────────────────────────
EXECUTION_ID=$(aws athena start-query-execution \
	--query-string "$QUERY" \
	--work-group "$WORKGROUP" \
	--query-execution-context "Database=$DATABASE" \
	--result-configuration "OutputLocation=$OUTPUT_LOCATION" \
	--output text --query 'QueryExecutionId')

if [[ -z "$EXECUTION_ID" ]]; then
	echo "Error: Failed to start Athena query." >&2
	exit 1
fi

# ── Poll for completion ──────────────────────────────────────────────────────
ELAPSED=0
STATE="RUNNING"

while [[ "$STATE" == "RUNNING" || "$STATE" == "QUEUED" ]]; do
	if [[ $ELAPSED -ge $TIMEOUT ]]; then
		echo "Error: Query timed out after ${TIMEOUT}s. Cancelling..." >&2
		aws athena stop-query-execution --query-execution-id "$EXECUTION_ID" 2>/dev/null || true
		echo "Query execution ID: $EXECUTION_ID (cancelled)" >&2
		exit 1
	fi

	sleep "$POLL_INTERVAL"
	ELAPSED=$((ELAPSED + POLL_INTERVAL))

	STATE=$(aws athena get-query-execution \
		--query-execution-id "$EXECUTION_ID" \
		--output text --query 'QueryExecution.Status.State')
done

# ── Check for failure ────────────────────────────────────────────────────────
if [[ "$STATE" != "SUCCEEDED" ]]; then
	REASON=$(aws athena get-query-execution \
		--query-execution-id "$EXECUTION_ID" \
		--output text --query 'QueryExecution.Status.StateChangeReason' 2>/dev/null || echo "Unknown error")
	echo "Error: Query $STATE — $REASON" >&2
	exit 1
fi

# ── Fetch results ─────────────────────────────────────────────────────────────
RESULTS=$(aws athena get-query-results \
	--query-execution-id "$EXECUTION_ID" \
	--output json)

# ── Get execution stats ──────────────────────────────────────────────────────
STATS=$(aws athena get-query-execution \
	--query-execution-id "$EXECUTION_ID" \
	--output json)

DATA_SCANNED=$(echo "$STATS" | jq -r '.QueryExecution.Statistics.DataScannedInBytes // 0')
EXEC_TIME=$(echo "$STATS" | jq -r '.QueryExecution.Statistics.EngineExecutionTimeInMillis // 0')
DATA_SCANNED_MB=$(echo "scale=2; $DATA_SCANNED / 1048576" | bc)

# ── Format output ─────────────────────────────────────────────────────────────
ROW_COUNT=$(echo "$RESULTS" | jq '.ResultSet.Rows | length - 1')  # subtract header row

if [[ "$FORMAT" == "csv" ]]; then
	# Header row
	echo "$RESULTS" | jq -r '.ResultSet.Rows[0].Data | [.[].VarCharValue] | @csv'
	# Data rows
	echo "$RESULTS" | jq -r '.ResultSet.Rows[1:] | .[] | .Data | [.[].VarCharValue // ""] | @csv'
else
	# Build tab-separated output for column -t
	{
		echo "$RESULTS" | jq -r '.ResultSet.Rows[0].Data | [.[].VarCharValue] | @tsv'
		echo "$RESULTS" | jq -r '.ResultSet.Rows[1:] | .[] | .Data | [.[].VarCharValue // ""] | @tsv'
	} | column -t -s $'\t'
fi

# ── Stats footer ──────────────────────────────────────────────────────────────
echo "" >&2
echo "--- ${ROW_COUNT} rows | ${DATA_SCANNED_MB} MB scanned | ${EXEC_TIME}ms ---" >&2
