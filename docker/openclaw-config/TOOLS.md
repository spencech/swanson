# Tools Reference

## Code Search (ChunkHound)

All 21 TeachUpbeat repositories are indexed locally with ChunkHound. Use these tools for code discovery:

- **search_semantic**: Concept-based search. Use when you're unsure of exact keywords.
  - Example: `search_semantic("authentication middleware", repo="administrator-portal")`
- **search_regex**: Pattern-based search. Use for exact function/class names.
  - Example: `search_regex("class.*extends AbstractRoute", repo="user-administrator")`
- **code_research**: Multi-file architectural analysis. Use for cross-cutting questions.
  - Example: `code_research("How does the survey submission flow work end-to-end?")`

## Repo Maintenance

- **refresh_repos**: Pull latest code from repos and re-index with ChunkHound. Always do both steps — a pull without re-indexing leaves the search results stale.
  - Example: `refresh_repos(repo="administrator-portal")` — refresh only one repo
  - Example: `refresh_repos()` — refresh all repos (slow, ~2 min)
  - **When to call**: user mentions recent commit/PR/deploy; search results look outdated; before planning against a repo the user says changed recently

## Plan Management

- **validate_plan**: Validates plan JSON against the IPlan schema. Always call before sending a plan to the client.
- **convert_to_spawnee_yaml**: Converts an approved plan to a downloadable spawnee YAML template.

## CLI Fallback

If `search_semantic`, `search_regex`, or `code_research` are not available as callable tools, use the ChunkHound CLI directly via shell commands. The results are identical.

```bash
# Semantic search (single repo)
cd /workspace/repos/<repo-name> && chunkhound search --semantic "authentication middleware"

# Regex search (single repo)
cd /workspace/repos/<repo-name> && chunkhound search --regex "class.*extends AbstractRoute"

# Deep research (single repo)
cd /workspace/repos/<repo-name> && chunkhound research "How does the survey submission flow work?"

# Search across all repos
for repo in /workspace/repos/*/; do echo "=== $(basename $repo) ==="; cd "$repo" && chunkhound search --semantic "your query" 2>/dev/null; done
```

Always prefer the registered tools when available — fall back to CLI only when they are not in your tool set.

## MySQL (Live Database Queries)

Use `query-mysql` to run **read-only** queries against the MySQL production read replica.

```bash
query-mysql [--format table|csv] [--limit N] "SQL QUERY"
```

**Flags:**
- `--format table` (default) — formatted table output
- `--format csv` — comma-separated output
- `--limit N` — max rows (default: 100, max: 1000)

**Safety rails:**
- Only `SELECT`, `SHOW`, `DESCRIBE`, `EXPLAIN`, and `WITH` (CTEs) are allowed
- `INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`, multi-statement queries are blocked
- LIMIT is auto-appended (100) if missing from SELECT queries
- 30-second query timeout

**Examples:**
```bash
query-mysql "SELECT COUNT(*) FROM users"
query-mysql --format csv --limit 50 "SELECT id, name FROM districts"
query-mysql "SHOW TABLES"
query-mysql "DESCRIBE users"
query-mysql "SELECT u.id, u.email FROM users u JOIN districts d ON u.district_id = d.id WHERE d.name = 'Springfield' LIMIT 10"
```

## Athena (Analytics Queries)

Use `query-athena` to run **read-only** queries against the `analytics_production` Athena database.

```bash
query-athena [--format table|csv] [--limit N] [--timeout N] "SQL QUERY"
```

**Flags:**
- `--format table` (default) — formatted table output
- `--format csv` — comma-separated output
- `--limit N` — max rows (default: 100, max: 1000)
- `--timeout N` — query timeout in seconds (default: 120, max: 300)

**Safety rails:**
- Only `SELECT`, `SHOW`, `DESCRIBE`, and `WITH` (CTEs) are allowed
- Dangerous operations are blocked
- LIMIT is auto-appended (100) if missing from SELECT queries
- On timeout, the running query is automatically cancelled

**Tables** (quote with double quotes — names contain hyphens):
- `"rds-users"`, `"rds-districts"`, `"rds-intervals"`
- `"rds-events"`, `"rds-schools"`, `"rds-networks"`

**Examples:**
```bash
query-athena 'SELECT * FROM "rds-users" LIMIT 5'
query-athena --format csv 'SELECT COUNT(*) FROM "rds-districts"'
query-athena --limit 500 'SELECT * FROM "rds-events" WHERE event_type = '\''survey_complete'\'''
query-athena 'SHOW TABLES'
```

**Cost awareness:** Athena charges per TB scanned. The stats footer shows data scanned for each query. Prefer filtering with `WHERE` clauses and using `LIMIT` to reduce scan volume.

## Repository Layout

Repos are at `/workspace/repos/<repo-name>/`. ChunkHound indexes are per-repo in `.chunkhound/` directories.

Per-repo AGENTS.md files (when present) are at `/workspace/repos/<repo-name>/AGENTS.md`. Read these for dense architectural context before planning steps that touch a given repo.

## Infrastructure

- **Gateway**: OpenClaw on port 18789
- **Persistence**: `/workspace/threads/`, `/workspace/plans/`
- **LLM**: Anthropic Claude via API key
