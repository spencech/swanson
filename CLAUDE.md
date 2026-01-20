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

## Branching Strategy (REQUIRED)

**Never target primary branches (main, develop, master) directly.** All spawnee plans must use an isolated integration branch pattern.

### Integration Branch Pattern

Every plan establishes a **spawnee integration branch** that serves as the base for all tasks. When a JIRA ticket is available, include it in the branch name:

```
spawnee/<TICKET>-<feature-description>
```

Examples:
- `spawnee/PD-1682-sso-integrations`
- `spawnee/PD-2041-payment-refactor`
- `spawnee/user-preferences` (when no ticket exists)

### How It Works

1. **Set the integration branch as `branch` and `baseBranch`** at the template level for all repositories
2. **Each task checks out its own feature branch** from the integration branch
3. **PRs merge back to the integration branch**, not to develop/main
4. **After all tasks complete**, a human reviews and merges the integration branch to the primary branch

### Task Branch Naming

Each task creates its own branch from the integration branch:

```bash
# Task checks out the integration branch first
git checkout spawnee/PD-1682-sso-integrations

# Then creates its own feature branch
git checkout -b spawnee/PD-1682-secret-infrastructure
```

Use descriptive suffixes that indicate what the task does:
- `spawnee/PD-1682-secret-infrastructure` (infra repo)
- `spawnee/PD-1682-frontend-environment` (frontend repo)
- `spawnee/PD-1682-api-endpoints` (backend repo)

### Template Example

```yaml
name: "PD-1682 SSO Integrations"
repository:
  url: "https://github.com/owner/frontend.git"
  branch: "spawnee/PD-1682-sso-integrations"
  baseBranch: "spawnee/PD-1682-sso-integrations"
model: "composer-1"

tasks:
  - id: infra-secrets
    name: "Set up secret infrastructure"
    repository:
      url: "https://github.com/owner/infra.git"
      branch: "spawnee/PD-1682-sso-integrations"
      baseBranch: "spawnee/PD-1682-sso-integrations"
    prompt: |
      ## Branch Setup
      ```bash
      git checkout spawnee/PD-1682-sso-integrations
      git checkout -b spawnee/PD-1682-secret-infrastructure
      ```

      ## Task
      Configure secrets for SSO integration...

      ## PR
      Create a PR targeting `spawnee/PD-1682-sso-integrations` (NOT develop/main).
    dependsOn: []

  - id: frontend-sso
    name: "Implement SSO frontend"
    prompt: |
      ## Branch Setup
      ```bash
      git fetch origin
      git checkout spawnee/PD-1682-sso-integrations
      git checkout -b spawnee/PD-1682-frontend-sso
      ```

      ## Task
      Implement SSO login flow...

      ## PR
      Create a PR targeting `spawnee/PD-1682-sso-integrations` (NOT develop/main).
    dependsOn:
      - infra-secrets
```

### Pre-requisite: Create the Integration Branch

Before running spawnee, manually create the integration branch in each repository:

```bash
# In each repository
git checkout develop
git pull origin develop
git checkout -b spawnee/PD-1682-sso-integrations
git push -u origin spawnee/PD-1682-sso-integrations
```

## Available Models

Query live models with `spawnee models`. Known working models:
- `composer-1` - Cursor's general-purpose agent model **(DEFAULT - use this for all plans)**
- `claude-4.5-opus-high-thinking` - Best for complex reasoning tasks
- `gpt-5.2` - OpenAI model
- `gpt-5.2-high` - OpenAI model with higher compute
- `gemini-3-pro` - Google model

**Default model**: Always use `composer-1` unless there's a specific reason to use another model.

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
name: "PD-2041 User Preferences"
repository:
  url: "https://github.com/owner/frontend.git"
  branch: "spawnee/PD-2041-user-preferences"
  baseBranch: "spawnee/PD-2041-user-preferences"
model: "composer-1"

tasks:
  - id: api-changes
    name: "Update API endpoints"
    repository:
      url: "https://github.com/owner/backend.git"
      branch: "spawnee/PD-2041-user-preferences"
      baseBranch: "spawnee/PD-2041-user-preferences"
    prompt: |
      ## Branch Setup
      ```bash
      git checkout spawnee/PD-2041-user-preferences
      git checkout -b spawnee/PD-2041-api-endpoints
      ```

      ## Task
      Add new /users/preferences endpoint that returns user settings.
      Include proper error handling and validation.

      ## PR
      Create a PR targeting `spawnee/PD-2041-user-preferences` (NOT develop/main).
    dependsOn: []

  - id: frontend-integration
    name: "Integrate new API"
    prompt: |
      ## Branch Setup
      ```bash
      git fetch origin
      git checkout spawnee/PD-2041-user-preferences
      git checkout -b spawnee/PD-2041-frontend-integration
      ```

      ## Task
      Call the new /users/preferences endpoint from the settings page.
      Display preferences in a form that allows editing.

      ## PR
      Create a PR targeting `spawnee/PD-2041-user-preferences` (NOT develop/main).
    dependsOn:
      - api-changes

  - id: add-tests
    name: "Add integration tests"
    prompt: |
      ## Branch Setup
      ```bash
      git fetch origin
      git checkout spawnee/PD-2041-user-preferences
      git pull origin spawnee/PD-2041-user-preferences
      git checkout -b spawnee/PD-2041-integration-tests
      ```

      ## Task
      Write integration tests for the preferences feature.

      ## PR
      Create a PR targeting `spawnee/PD-2041-user-preferences` (NOT develop/main).
    dependsOn:
      - frontend-integration
```

## Best Practices

1. **Always use integration branches** - Never target develop/main directly; use `spawnee/<TICKET>-<description>` pattern
2. **Include JIRA ticket in branch names** - When available, always include the ticket number (e.g., `spawnee/PD-1682-feature`)
3. **Use `composer-1` as default model** - Only change models when there's a specific need
4. **Use descriptive task IDs** - They appear in logs and status output
5. **Write detailed prompts** - Agents work autonomously; be specific about branch setup, task, and PR target
6. **Set breakpoints strategically** - Before critical dependent tasks
7. **Parallelize independent work** - Tasks with no dependencies run concurrently
8. **Use task-level overrides** - When tasks target different repos or need different models

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
