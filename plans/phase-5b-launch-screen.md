# Phase 5b: Launch Screen & Repository Workspace

## Overview

Add a launch screen that appears every time the app starts, even for authenticated users. The screen handles authentication (if needed) and repository workspace selection. Selected repositories are cloned/updated locally, and their paths are passed to Claude Code for context-aware plan generation.

**Key Behaviors:**
- Infrastructure and database repos are **always** checked out automatically
- Users select which application repos they want to work with (no persistence across sessions)
- "I'm not sure" option delegates repo selection to Claude via metadata
- All cloning happens in parallel for speed

---

## Repository Classification

### Always Checked Out (Automatic)
These repos are cloned/updated on every launch without user selection:

| Repository | URL | Rationale |
|------------|-----|-----------|
| `upbeat-aws-infrastructure` | `git@github.com:TeachUpbeat/upbeat-aws-infrastructure.git` | Infrastructure changes often required implicitly |
| `upbeat-engagement-database` | `git@github.com:TeachUpbeat/engagement-database.git` | Schema changes often required implicitly |

### User-Selectable Repositories
Multi-select dropdown options:

| Repository | URL |
|------------|-----|
| `upbeat-admin-portal` | `git@github.com:TeachUpbeat/administrator-portal.git` |
| `upbeat-district-administration` | `git@github.com:TeachUpbeat/district-administrator.git` |
| `upbeat-reports` | `git@github.com:TeachUpbeat/reports-2.0.git` |
| `upbeat-survey-administration` | `git@github.com:TeachUpbeat/upbeat-survey-administration.git` |
| `upbeat-survey-editor` | `git@github.com:TeachUpbeat/survey-administrator.git` |
| `upbeat-user-administration` | `git@github.com:TeachUpbeat/user-administrator.git` |
| `upbeat-survey-legacy` | `git@github.com:TeachUpbeat/survey.git` |
| `upbeat-pdf-generator` | `git@github.com:TeachUpbeat/pdf-generator.git` |
| `upbeat-presentation-generator` | `git@github.com:TeachUpbeat/google-presentations.git` |

### Special Option
- **"I'm not sure"** — Only clones automatic repos; passes all repo metadata to Claude with instructions to determine relevance using descriptions and GitHub API

---

## User Flow

### First Launch (Not Authenticated)
```
┌─────────────────────────────────────────────────────────────┐
│  Step 1: Google SSO                                         │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  [Sign in with Google]                               │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  Step 2: GitHub Device Flow                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Enter code: XXXX-XXXX                               │   │
│  │  [Open GitHub]                                       │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  Step 3: Repository Selection                               │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Select repositories to work with:                   │   │
│  │  ☐ upbeat-admin-portal                               │   │
│  │  ☐ upbeat-district-administration                    │   │
│  │  ☐ upbeat-reports                                    │   │
│  │  ...                                                 │   │
│  │  ☐ I'm not sure                                      │   │
│  │                                                      │   │
│  │  [Continue]                                          │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  Step 4: Workspace Setup (Progress)                         │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Setting up workspace...                             │   │
│  │  ✓ upbeat-aws-infrastructure                         │   │
│  │  ✓ upbeat-engagement-database                        │   │
│  │  ◐ upbeat-admin-portal                               │   │
│  │  ○ upbeat-reports                                    │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              ↓
                        Chat Interface
```

### Subsequent Launch (Already Authenticated)
```
┌─────────────────────────────────────────────────────────────┐
│  Welcome Back Screen                                        │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Welcome back, Chris!                                │   │
│  │                                                      │   │
│  │  Select repositories to work with:                   │   │
│  │  ☐ upbeat-admin-portal                               │   │
│  │  ☐ upbeat-district-administration                    │   │
│  │  ...                                                 │   │
│  │  ☐ I'm not sure                                      │   │
│  │                                                      │   │
│  │  [Continue]                                          │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              ↓
                   Workspace Setup → Chat
```

---

## Implementation Plan

### Step 1: Add Workspace Configuration to Store

**File**: `electron/store.ts`

Add workspace schema and functions:

```typescript
interface StoreSchema {
  // ... existing auth, github, settings ...
  workspace: {
    repoBasePath: string  // ~/Library/Application Support/Swanson/repos/
    clonedRepos: {        // Track which repos are cloned
      [repoName: string]: {
        path: string
        lastUpdated: number
      }
    }
  }
}

// Functions to add:
export function getWorkspaceConfig(): WorkspaceConfig
export function setClonedRepo(repoName: string, path: string): void
export function getClonedRepos(): Record<string, { path: string; lastUpdated: number }>
```

---

### Step 2: Create Git Operations Module

**File**: `electron/git-ops.ts` (NEW)

Handle git clone and pull operations:

```typescript
import { exec } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'

const REPO_BASE_PATH = path.join(app.getPath('userData'), 'repos')

interface CloneResult {
  success: boolean
  repoName: string
  localPath: string
  error?: string
}

/**
 * Clone a repo or pull latest if already cloned
 * Always checks out 'develop' branch
 */
export async function ensureRepo(repoUrl: string, repoName: string): Promise<CloneResult>

/**
 * Clone/update multiple repos in parallel
 */
export async function ensureRepos(repos: Array<{ url: string; name: string }>): Promise<CloneResult[]>

/**
 * Check if a repo is already cloned locally
 */
export function isRepoCloned(repoName: string): boolean

/**
 * Get the local path for a repo
 */
export function getRepoPath(repoName: string): string
```

Implementation details:
- Use `git clone --branch develop --single-branch` for initial clone
- Use `git fetch origin && git checkout develop && git reset --hard origin/develop` for updates
- Run operations in parallel using `Promise.all()`
- Store paths in electron-store for quick lookup

---

### Step 3: Update Repository Module

**File**: `electron/repos.ts`

Add repository classification and workspace integration:

```typescript
// Repository classification
export const AUTOMATIC_REPOS = [
  { name: 'upbeat-aws-infrastructure', url: 'git@github.com:TeachUpbeat/upbeat-aws-infrastructure.git' },
  { name: 'upbeat-engagement-database', url: 'git@github.com:TeachUpbeat/engagement-database.git' },
]

export const SELECTABLE_REPOS = [
  { name: 'upbeat-admin-portal', url: 'git@github.com:TeachUpbeat/administrator-portal.git' },
  { name: 'upbeat-district-administration', url: 'git@github.com:TeachUpbeat/district-administrator.git' },
  { name: 'upbeat-reports', url: 'git@github.com:TeachUpbeat/reports-2.0.git' },
  { name: 'upbeat-survey-administration', url: 'git@github.com:TeachUpbeat/upbeat-survey-administration.git' },
  { name: 'upbeat-survey-editor', url: 'git@github.com:TeachUpbeat/survey-administrator.git' },
  { name: 'upbeat-user-administration', url: 'git@github.com:TeachUpbeat/user-administrator.git' },
  { name: 'upbeat-survey-legacy', url: 'git@github.com:TeachUpbeat/survey.git' },
  { name: 'upbeat-pdf-generator', url: 'git@github.com:TeachUpbeat/pdf-generator.git' },
  { name: 'upbeat-presentation-generator', url: 'git@github.com:TeachUpbeat/google-presentations.git' },
]

/**
 * Format repo context for Claude with local paths
 */
export function formatRepoContextWithPaths(
  checkedOutRepos: Array<{ name: string; path: string; description?: string }>,
  metadataOnlyRepos: Repository[],
  isUnsure: boolean
): string
```

---

### Step 4: Add IPC Handlers for Workspace

**File**: `electron/main.ts`

Add workspace-related IPC handlers:

```typescript
ipcMain.handle('workspace:get-selectable-repos', async () => {
  // Return list of selectable repos with descriptions from GitHub
})

ipcMain.handle('workspace:setup', async (event, selectedRepoNames: string[], isUnsure: boolean) => {
  // 1. Always clone/update automatic repos
  // 2. Clone/update selected repos (unless isUnsure)
  // 3. Return progress updates via event emitter
  // 4. Return final workspace config
})

ipcMain.handle('workspace:get-status', async () => {
  // Return current cloned repos and their paths
})
```

---

### Step 5: Update Preload Script

**File**: `electron/preload.ts`

Expose workspace API:

```typescript
workspace: {
  getSelectableRepos: () => ipcRenderer.invoke('workspace:get-selectable-repos'),
  setup: (selectedRepos: string[], isUnsure: boolean) => ipcRenderer.invoke('workspace:setup', selectedRepos, isUnsure),
  getStatus: () => ipcRenderer.invoke('workspace:get-status'),
  onProgress: (callback: (progress: WorkspaceProgress) => void) => {
    ipcRenderer.on('workspace:progress', (_, progress) => callback(progress))
    return () => ipcRenderer.removeAllListeners('workspace:progress')
  }
}
```

---

### Step 6: Create Workspace Hook

**File**: `src/hooks/useWorkspace.ts` (NEW)

```typescript
interface WorkspaceState {
  isSettingUp: boolean
  progress: WorkspaceProgress | null
  selectableRepos: SelectableRepo[]
  error: string | null
}

interface SelectableRepo {
  name: string
  url: string
  description: string
}

interface WorkspaceProgress {
  total: number
  completed: number
  current: string
  repos: Array<{
    name: string
    status: 'pending' | 'cloning' | 'updating' | 'done' | 'error'
    error?: string
  }>
}

export function useWorkspace() {
  // Load selectable repos on mount
  // Provide setup function
  // Track progress via IPC listener
}
```

---

### Step 7: Create Launch Screen Component

**File**: `src/components/LaunchScreen.tsx` (NEW)

Unified launch screen handling all steps:

```typescript
interface LaunchScreenProps {
  isGoogleConnected: boolean
  isGitHubConnected: boolean
  user: User | null
  onGoogleLogin: () => Promise<void>
  onWorkspaceReady: (config: WorkspaceConfig) => void
}

export function LaunchScreen({ ... }: LaunchScreenProps) {
  // Step state management
  // Renders appropriate step based on auth state
  // Step 1: Google SSO (if needed)
  // Step 2: GitHub Device Flow (if needed)
  // Step 3: Repository selection (always, with "Welcome back" if authenticated)
  // Step 4: Workspace setup progress
}
```

UI Components within:
- `RepoSelector` — Multi-select checkbox list with "I'm not sure" option
- `WorkspaceProgress` — Progress indicator during clone/update

---

### Step 8: Update App.tsx

**File**: `src/App.tsx`

Modify routing logic:

```typescript
function App() {
  const [workspaceReady, setWorkspaceReady] = useState(false)
  const [workspaceConfig, setWorkspaceConfig] = useState<WorkspaceConfig | null>(null)

  // Show LaunchScreen until workspace is ready
  // Pass workspaceConfig to ChatContainer for Claude context
  
  return (
    <div>
      {/* Title bar */}
      {!workspaceReady ? (
        <LaunchScreen
          isGoogleConnected={isGoogleConnected}
          isGitHubConnected={isGitHubConnected}
          user={user}
          onGoogleLogin={login}
          onWorkspaceReady={(config) => {
            setWorkspaceConfig(config)
            setWorkspaceReady(true)
          }}
        />
      ) : (
        <ChatContainer workspaceConfig={workspaceConfig} />
      )}
    </div>
  )
}
```

---

### Step 9: Update Claude Code Integration

**File**: `electron/claude-code.ts`

Modify `startClaudeSession` to accept workspace config and inject local paths:

```typescript
export async function startClaudeSession(
  mainWindow: BrowserWindow,
  prompt: string,
  workspaceConfig: WorkspaceConfig,  // NEW parameter
  workingDirectory?: string
): Promise<void> {
  // Build context based on workspace config
  const repoContext = formatRepoContextWithPaths(
    workspaceConfig.checkedOutRepos,
    workspaceConfig.metadataOnlyRepos,
    workspaceConfig.isUnsure
  )

  // System prompt additions for local repos
  systemPromptParts.push(`## Local Repository Workspace

The following repositories have been checked out to your local filesystem on the \`develop\` branch:

${workspaceConfig.checkedOutRepos.map(r => `- **${r.name}**: \`${r.path}\``).join('\n')}

**Infrastructure & Database repos are always available** for any features requiring:
- AWS infrastructure changes (Lambda, CloudFormation, Cognito, etc.)
- Database schema changes (MySQL stored procedures, migrations, etc.)

You can read files directly from these paths to understand existing code structure.`)

  if (workspaceConfig.isUnsure) {
    systemPromptParts.push(`## Repository Selection Guidance

The user was unsure which repositories are needed for their request. Use the repository descriptions below and the GitHub API (if needed) to determine which repositories should be included in the spawnee plan:

${workspaceConfig.metadataOnlyRepos.map(r => `- **${r.name}**: ${r.description}`).join('\n')}

Analyze the user's request and identify which repositories will need changes.`)
  }
}
```

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `electron/store.ts` | Modify | Add workspace schema |
| `electron/git-ops.ts` | Create | Git clone/pull operations |
| `electron/repos.ts` | Modify | Add repo classification, path formatting |
| `electron/main.ts` | Modify | Add workspace IPC handlers |
| `electron/preload.ts` | Modify | Expose workspace API |
| `electron/claude-code.ts` | Modify | Accept workspace config, inject paths |
| `src/hooks/useWorkspace.ts` | Create | Workspace state management |
| `src/components/LaunchScreen.tsx` | Create | Unified launch flow UI |
| `src/components/LoginScreen.tsx` | Remove/Deprecate | Replaced by LaunchScreen |
| `src/App.tsx` | Modify | Route through LaunchScreen |

---

## Verification Checklist

### Authentication Flow
- [ ] First launch shows Google SSO → GitHub → Repo selection → Setup → Chat
- [ ] Subsequent launch shows "Welcome back" → Repo selection → Setup → Chat
- [ ] Logout clears auth but launch screen still appears on next open

### Repository Operations
- [ ] Automatic repos (aws-infrastructure, engagement-database) always cloned/updated
- [ ] Selected repos are cloned on first selection, updated on subsequent
- [ ] "I'm not sure" skips cloning selectable repos
- [ ] Parallel cloning works without race conditions
- [ ] Progress UI shows real-time status for each repo
- [ ] Git errors are handled gracefully (network, auth, etc.)

### Claude Integration
- [ ] Claude receives local paths for checked-out repos
- [ ] Claude is told about infrastructure/database repos being available
- [ ] "I'm not sure" mode includes repo metadata and selection guidance
- [ ] Claude can reference local file paths in responses

### Edge Cases
- [ ] Handles missing `develop` branch gracefully (fall back to default branch)
- [ ] Handles repo rename/removal in org
- [ ] Works offline for already-cloned repos (skip pull, warn user)
- [ ] Handles disk space issues

---

## Security Considerations

- **Git SSH keys**: Relies on user's existing SSH config for GitHub access
- **Local storage**: Repos stored in app support directory with user-level permissions
- **No secrets in repos**: Repos contain source code only, no credentials
- **Read-only context**: Claude receives paths for reading, not modification
