# Tools Reference

## Code Search (ChunkHound)

All 20 TeachUpbeat repositories are indexed locally with ChunkHound. Use these tools for code discovery:

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

## Repository Layout

Repos are at `/workspace/repos/<repo-name>/`. ChunkHound indexes are per-repo in `.chunkhound/` directories.

Per-repo AGENTS.md files (when present) are at `/workspace/repos/<repo-name>/AGENTS.md`. Read these for dense architectural context before planning steps that touch a given repo.

## Infrastructure

- **Gateway**: OpenClaw on port 18789
- **Persistence**: `/workspace/threads/`, `/workspace/plans/`
- **LLM**: Anthropic Claude via API key
