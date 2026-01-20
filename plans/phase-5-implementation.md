# Phase 5: Repository Configuration with GitHub OAuth

## Overview

Add GitHub authentication using OAuth Device Flow to enable repository access. Users will connect both Google (for API gateway) and GitHub (for repo access) during app launch. The static repository list will be replaced with dynamic fetching from the TeachUpbeat GitHub organization.

**Note**: Repository access is read-only. This tool will not push branches, create PRs, or modify repository contents.

## Prerequisites

### Create GitHub App (Manual Step)

1. Go to https://github.com/settings/apps/new (or org settings for TeachUpbeat)
2. Configure:
   - **App name**: `Swanson Desktop`
   - **Homepage URL**: `https://teachupbeat.com`
   - **Device flow**: Enable ✓
   - **Callback URL**: Leave empty (device flow doesn't use it)
   - **Webhook**: Disable (uncheck "Active")
  - **Permissions**:
    - Repository permissions → Contents: **Read-only** (read-only access, no write/push operations)
    - Repository permissions → Metadata: Read-only
    - Organization permissions → Members: Read-only (to list org repos)
  - **Expire user authorization tokens**: **Check ✓** (enables 8-hour token expiration with refresh tokens)
  - **Where can this GitHub App be installed?**: Only on this account
3. After creation, note the **Client ID** (NOT the App ID) - **Client ID**: `Iv23liurMNhAe3Pg8exL`
4. Install the app on the TeachUpbeat organization

---

## Implementation Plan

### Step 1: Add GitHub Store Schema

**File**: `electron/store.ts`

Add GitHub auth fields to the store schema:

```typescript
interface StoreSchema {
  auth: {
    accessToken?: string
    refreshToken?: string
    user?: { email: string; name: string }
  }
  github: {
    accessToken?: string
    refreshToken?: string  // Required for token refresh (6-month validity)
    expiresAt?: number    // Timestamp when access token expires
    user?: { login: string; name: string; avatarUrl: string }
  }
  settings: { ... }
}
```

Add functions:
- `getGitHubAuth()`: Retrieve GitHub tokens (returns `{ accessToken?, refreshToken?, expiresAt? }`)
- `setGitHubAuth(auth)`: Store GitHub tokens (accepts `{ accessToken, refreshToken, expiresAt }`)
- `clearGitHubAuth()`: Clear GitHub tokens

---

### Step 2: Create GitHub Device Flow Auth Module

**File**: `electron/github-auth.ts` (NEW)

Implement GitHub OAuth Device Flow:

```typescript
const GITHUB_CLIENT_ID = 'Iv23liurMNhAe3Pg8exL' // GitHub App Client ID

interface DeviceCodeResponse {
  device_code: string
  user_code: string
  verification_uri: string
  expires_in: number
  interval: number
}

interface TokenResponse {
  access_token: string
  refresh_token?: string  // Present when token expiration is enabled
  token_type: string
  scope: string
  expires_in?: number     // Seconds until expiration (typically 28800 = 8 hours)
}

export async function startGitHubDeviceFlow(): Promise<{
  userCode: string
  verificationUri: string
  pollForToken: () => Promise<TokenResponse>
}>

export async function refreshGitHubToken(refreshToken: string): Promise<TokenResponse>
```

Flow:
1. POST to `https://github.com/login/device/code` with client_id and scope
2. Return `user_code` and `verification_uri` to display to user
3. Open browser to verification URL
4. Poll `https://github.com/login/oauth/access_token` until user completes auth
5. Store tokens and expiration timestamp via `setGitHubAuth()`:
   - `accessToken`: The access token
   - `refreshToken`: The refresh token (if present)
   - `expiresAt`: `Date.now() + (expires_in * 1000)` (if expires_in provided)

Error handling:
- `authorization_pending`: Continue polling
- `slow_down`: Increase interval
- `expired_token`: Restart flow
- `access_denied`: User rejected

Token refresh:
- When `expires_in` is present, calculate expiration timestamp
- Before making API calls, check if token is expired or near expiration (< 5 minutes)
- Call `refreshGitHubToken()` with stored `refreshToken`
- POST to `https://github.com/login/oauth/access_token` with:
  - `client_id`: Your GitHub App Client ID
  - `grant_type`: `refresh_token`
  - `refresh_token`: The stored refresh token
- Update stored tokens with new response

---

### Step 3: Create GitHub API Client

**File**: `electron/github-api.ts` (NEW)

```typescript
export async function getAuthenticatedUser(token: string): Promise<GitHubUser>
export async function listOrgRepos(token: string, org: string): Promise<Repository[]>
export async function getRepoDetails(token: string, owner: string, repo: string): Promise<Repository>
```

Uses GitHub REST API with token in Authorization header.

**Token refresh integration**:
- Before each API call, check if token needs refresh (via `getGitHubAuth()`)
- If expired or near expiration, call `refreshGitHubToken()` first
- Handle 401 responses by attempting refresh, then retrying the request
- If refresh fails, clear auth and prompt user to re-authenticate

---

### Step 4: Update IPC Handlers

**File**: `electron/main.ts`

Add new IPC handlers:

```typescript
ipcMain.handle('github:start-auth', async () => {
  // Start device flow, return user code and verification URI
})

ipcMain.handle('github:poll-token', async () => {
  // Poll for token completion
})

ipcMain.handle('github:get-state', async () => {
  // Return current GitHub auth state
})

ipcMain.handle('github:logout', async () => {
  // Clear GitHub auth
})

ipcMain.handle('github:list-repos', async () => {
  // Fetch repos from TeachUpbeat org
})
```

---

### Step 5: Update Preload Script

**File**: `electron/preload.ts`

Expose GitHub API to renderer:

```typescript
github: {
  startAuth: () => ipcRenderer.invoke('github:start-auth'),
  pollToken: () => ipcRenderer.invoke('github:poll-token'),
  getState: () => ipcRenderer.invoke('github:get-state'),
  logout: () => ipcRenderer.invoke('github:logout'),
  listRepos: () => ipcRenderer.invoke('github:list-repos')
}
```

---

### Step 6: Create useGitHub Hook

**File**: `src/hooks/useGitHub.ts` (NEW)

```typescript
interface GitHubState {
  isConnected: boolean
  isLoading: boolean
  user: GitHubUser | null
  error: string | null
}

export function useGitHub() {
  // Check initial connection state
  // Provide connect/disconnect functions
  // Return repos when connected
}
```

---

### Step 7: Update Login Screen for Dual Auth

**File**: `src/components/LoginScreen.tsx`

Modify to show two-step authentication:

1. **Step 1**: Google SSO (existing)
2. **Step 2**: GitHub Device Flow (new)
   - Display: "Enter this code on GitHub: **XXXX-XXXX**"
   - Button: "Open GitHub" (opens verification URL)
   - Polling indicator while waiting
   - Success state when connected

UI States:
- Neither connected → Show Google button
- Google connected, GitHub not → Show GitHub device code
- Both connected → Redirect to chat

---

### Step 8: Update useAuth Hook

**File**: `src/hooks/useAuth.ts`

Add GitHub state tracking:

```typescript
interface AuthState {
  isAuthenticated: boolean  // Now requires BOTH Google AND GitHub
  isGoogleConnected: boolean
  isGitHubConnected: boolean
  isLoading: boolean
  user: User | null
  githubUser: GitHubUser | null
  error: string | null
}
```

---

### Step 9: Create Repository Context for Claude

**File**: `electron/repos.ts` (NEW)

```typescript
export async function loadRepositories(): Promise<Repository[]> {
  const auth = getGitHubAuth()
  if (!auth?.accessToken) throw new Error('GitHub not connected')

  // Ensure token is fresh before making API call
  const token = await ensureValidToken(auth)
  
  const repos = await listOrgRepos(token, 'TeachUpbeat')
  return repos.filter(r => !r.archived)
}

async function ensureValidToken(auth: GitHubAuth): Promise<string> {
  // Check if token is expired or expires soon (< 5 minutes)
  if (auth.expiresAt && Date.now() >= auth.expiresAt - 5 * 60 * 1000) {
    if (!auth.refreshToken) {
      throw new Error('Token expired and no refresh token available')
    }
    const refreshed = await refreshGitHubToken(auth.refreshToken)
    const newAuth = {
      accessToken: refreshed.access_token,
      refreshToken: refreshed.refresh_token || auth.refreshToken,
      expiresAt: refreshed.expires_in 
        ? Date.now() + (refreshed.expires_in * 1000)
        : undefined
    }
    setGitHubAuth(newAuth)
    return newAuth.accessToken
  }
  return auth.accessToken
}

export function formatRepoContext(repos: Repository[]): string {
  // Format for Claude system prompt injection
}
```

---

### Step 10: Update Claude Code Integration

**File**: `electron/claude-code.ts`

Modify `startClaudeSession` to inject repository context:

```typescript
export async function startClaudeSession(
  mainWindow: BrowserWindow,
  prompt: string,
  workingDirectory?: string
) {
  const repos = await loadRepositories()
  const repoContext = formatRepoContext(repos)

  const enhancedPrompt = `${prompt}

## Available Repositories
${repoContext}`

  // ... existing spawn logic with enhancedPrompt
}
```

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `electron/store.ts` | Modify | Add GitHub auth schema |
| `electron/github-auth.ts` | Create | Device flow implementation |
| `electron/github-api.ts` | Create | GitHub REST API client |
| `electron/repos.ts` | Create | Repository loading and formatting |
| `electron/main.ts` | Modify | Add GitHub IPC handlers |
| `electron/preload.ts` | Modify | Expose GitHub API to renderer |
| `electron/claude-code.ts` | Modify | Inject repo context |
| `src/hooks/useGitHub.ts` | Create | React hook for GitHub state |
| `src/hooks/useAuth.ts` | Modify | Track dual auth state |
| `src/components/LoginScreen.tsx` | Modify | Two-step auth UI |
| `config/constants.ts` | Create | GitHub App Client ID |

---

## Verification Checklist

After implementation, verify:

- [ ] GitHub App created with correct permissions
- [ ] App launches and shows Google SSO button
- [ ] After Google auth, GitHub device code screen appears
- [ ] Device code displayed with "Open GitHub" button
- [ ] Browser opens to GitHub verification page
- [ ] After entering code, app detects success and proceeds
- [ ] Both auth states persist after app restart
- [ ] Logout clears both Google and GitHub auth
- [ ] In chat, ask "What repositories do you have access to?"
- [ ] Claude lists TeachUpbeat organization repositories
- [ ] Error handling works (network failure, auth denied, expired code)
- [ ] Token refresh works automatically when access token expires
- [ ] Refresh token persists across app restarts
- [ ] 401 responses trigger token refresh automatically
- [ ] Repository access is read-only (no write operations attempted)

---

## Security Considerations

- **No client secret**: Device flow doesn't require secrets (safe for desktop apps)
- **Token storage**: GitHub tokens stored encrypted in electron-store
- **Scope limitation**: Only request necessary permissions (repo read-only, read:org)
- **Token expiration**: Access tokens expire after 8 hours; refresh tokens valid for 6 months
- **Token refresh**: Automatically refresh expired tokens using refresh_token before API calls
- **Read-only access**: Repository permissions set to read-only; no write/push operations
- **401 handling**: On 401 responses, attempt token refresh; if refresh fails, clear auth and require re-authentication
