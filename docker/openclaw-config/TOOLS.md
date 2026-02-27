# Tools Reference

## Code Search (ChunkHound)

All 11 TeachUpbeat repositories are indexed locally with ChunkHound. Use these tools for code discovery:

- **search_semantic**: Concept-based search. Use when you're unsure of exact keywords.
  - Example: `search_semantic("authentication middleware", repo="administrator-portal")`
- **search_regex**: Pattern-based search. Use for exact function/class names.
  - Example: `search_regex("class.*extends AbstractRoute", repo="user-administrator")`
- **code_research**: Multi-file architectural analysis. Use for cross-cutting questions.
  - Example: `code_research("How does the survey submission flow work end-to-end?")`

## Plan Management

- **validate_plan**: Validates plan JSON against the IPlan schema. Always call before sending a plan to the client.
- **convert_to_spawnee_yaml**: Converts an approved plan to a downloadable spawnee YAML template.

## Repository Layout

Repos are at `/workspace/repos/<repo-name>/`. ChunkHound indexes are per-repo in `.chunkhound/` directories.

## Infrastructure

- **Gateway**: OpenClaw on port 18789
- **Persistence**: `/workspace/threads/`, `/workspace/plans/`
- **LLM**: Anthropic Claude via API key
