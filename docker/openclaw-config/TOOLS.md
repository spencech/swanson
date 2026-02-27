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

- **refresh_repos**: Pull latest code from repos and re-index. Use when the user mentions stale code or before planning against recently changed repos.
  - Example: `refresh_repos(repo="administrator-portal")` — refresh only one repo
  - Example: `refresh_repos()` — refresh all repos (slow)

## Plan Management

- **validate_plan**: Validates plan JSON against the IPlan schema. Always call before sending a plan to the client.
- **convert_to_spawnee_yaml**: Converts an approved plan to a downloadable spawnee YAML template.

## Repository Layout

Repos are at `/workspace/repos/<repo-name>/`. ChunkHound indexes are per-repo in `.chunkhound/` directories.

Per-repo AGENTS.md files (when present) are at `/workspace/repos/<repo-name>/AGENTS.md`. Read these for dense architectural context before planning steps that touch a given repo.

## Infrastructure

- **Gateway**: OpenClaw on port 18789
- **Persistence**: `/workspace/threads/`, `/workspace/plans/`
- **LLM**: Anthropic Claude via API key
