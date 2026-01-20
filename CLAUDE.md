# Spawnee Task Template Guide

Use this guide when creating YAML task templates for spawnee, a CLI tool that orchestrates Cursor Cloud Agents.

Review ALL Documentation: https://www.npmjs.com/package/spawnee

## Template Structure

```yaml
name: "Template Name"
repository:
  url: "https://github.com/owner/repo.git"
  branch: "develop"  # Default branch for all tasks
  baseBranch: "develop"
model: "composer-1"  # Default model

tasks:
  - id: unique-task-id
    name: "Human-readable task name"
    prompt: "Detailed instructions for the agent"
    dependsOn: []  # Array of task IDs this depends on
    branch: "feature-branch"  # Optional: override default branch
    repository:  # Optional: override default repository
      url: "https://github.com/owner/other-repo.git"
      branch: "develop"
    model: "composer-1"  # Optional: override default model
    breakpoint: true  # Optional: pause for human review
```

## Available Models

Query live models with `spawnee models`. Known working models:
- `claude-4.5-opus-high-thinking` - Best for complex reasoning tasks
- `composer-1` - Cursor's general-purpose agent model
- `gpt-5.2` - OpenAI model
- `gpt-5.2-high` - OpenAI model with higher compute
- `gemini-3-pro` - Google model

**Important**: The `/v0/models` endpoint only returns models available for Cloud Agents API, which differs from models in Cursor IDE. Models like `composer-1` work even if not listed.

## Task Dependencies

Tasks execute based on dependency graph:
- Tasks with empty `dependsOn: []` run immediately in parallel
- Tasks wait for all dependencies to complete before starting
- Use `breakpoint: true` to pause after a task for human review before dependents run

**Important for dependent tasks**: When a task depends on another, its agent starts fresh without knowledge of prior work. Always instruct dependent tasks to pull the latest changes:

```yaml
- id: dependent-task
  prompt: |
    ## PREREQUISITE: Merge Dependency Branch

      ```bash
      git fetch origin
      git checkout dependency-branch
      git merge origin/feature-branch--no-edit
      ```

      Verify merge succeeded: ... if possible look for evidence of successful change (e.g., an expected file )
  dependsOn:
    - prior-task
```

## When to Use Multiple Tasks vs Single Task

**Prefer fewer tasks with more work each.** A single agent can complete multiple related steps.

Use **separate tasks/agents** when:
- Work targets different repositories
- Changes are in completely unrelated areas (low conflict risk)
- Individual changes are expansive and would benefit from dedicated context windows
- You need a breakpoint between steps for human review

Use a **single task** when:
- Steps are sequential, related and sufficiently discrete that they can be done safely in a standard context window
- Changes might touch the same files
- Work is in the same area of the codebase

Example - **BAD** (unnecessary splitting):
```yaml
tasks:
  - id: create-component
    prompt: "Create Button component"
  - id: add-styles
    prompt: "Add styles to Button"
    dependsOn: [create-component]
  - id: add-tests
    prompt: "Add tests for Button"
    dependsOn: [add-styles]
```

Example - **GOOD** (single agent does related work):
```yaml
tasks:
  - id: create-button
    prompt: |
      Create a Button component with:
      - The component implementation
      - Styled with CSS modules
      - Unit tests
```

## Breakpoints

**Only add breakpoints if the user explicitly requests them.** Assume no breakpoints unless specified.

When a task has `breakpoint: true`:
1. Task executes normally
2. After completion, CLI prompts: `Continue to dependent tasks? (Y/n)`
3. User can review agent output before proceeding
4. Selecting "n" aborts remaining dependent tasks

## Task-Level Overrides

Each task can override template defaults:
- `branch` - Use a different branch in the same repository
- `repository` - Target a different repo (with its own branch)
- `model` - Use a different model for specific tasks

This enables multi-repository and multi-branch orchestration in a single template.

## Example: Multi-Repository Template

```yaml
name: "Cross-Repo Feature"
repository:
  url: "https://github.com/owner/frontend.git"
  branch: "main"
model: "claude-4.5-opus-high-thinking"

tasks:
  - id: api-changes
    name: "Update API endpoints"
    repository:  # Different repo
      url: "https://github.com/owner/backend.git"
      branch: "develop"
    model: "composer-1"  # Different model
    prompt: |
      Add new /users/preferences endpoint that returns user settings.
      Include proper error handling and validation.
    dependsOn: []

  - id: frontend-integration
    name: "Integrate new API"
    branch: "feature/preferences"  # Different branch, same repo
    prompt: |
      First, pull the latest changes.
      Call the new /users/preferences endpoint from the settings page.
      Display preferences in a form that allows editing.
    dependsOn:
      - api-changes

  - id: add-tests
    name: "Add integration tests"
    branch: "feature/preferences"
    prompt: |
      First, pull the latest changes.
      Write integration tests for the preferences feature.
    dependsOn:
      - frontend-integration
```

## Best Practices

1. **Use descriptive task IDs** - They appear in logs and status output
2. **Write detailed prompts** - Agents work autonomously; be specific
3. **Set breakpoints strategically** - Before critical dependent tasks
4. **Parallelize independent work** - Tasks with no dependencies run concurrently
5. **Use task-level overrides** - When tasks target different repos or need different models

## Running Templates

```bash
# Execute a template
spawnee run template.yaml

# Check status of a running agent
spawnee status <conversationId>

# List available models
spawnee models
```

## Status Tracking

Spawnee updates the YAML file in-place with execution status:
- Adds `conversationId` to each task after spawning
- Updates task status (pending, running, completed, failed)
- Enables resuming or checking progress
