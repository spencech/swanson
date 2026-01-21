import { contextBridge, ipcRenderer } from 'electron'

// Auth state type
interface AuthState {
  isAuthenticated: boolean
  user?: {
    email: string
    name: string
  }
}

interface AuthResult {
  success: boolean
  user?: { email: string; name: string }
  error?: string
}

interface Settings {
  theme: 'light' | 'dark'
  jiraEmail?: string
  jiraApiToken?: string
}

interface ClaudeOutputChunk {
  type: 'text' | 'error' | 'done' | 'start'
  content?: string
  error?: string
}

interface GitHubUser {
  login: string
  name: string
  avatarUrl: string
}

interface GitHubState {
  isConnected: boolean
  user: GitHubUser | null
}

interface GitHubAuthResult {
  success: boolean
  pending?: boolean
  userCode?: string
  verificationUri?: string
  user?: GitHubUser
  error?: string
  recommendedInterval?: number // Recommended polling interval in seconds (for slow_down)
}

interface GitHubReposResult {
  success: boolean
  repos?: Array<{
    id: number
    name: string
    full_name: string
    description: string | null
    html_url: string
  }>
  error?: string
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

interface WorkspaceConfig {
  checkedOutRepos: Array<{
    name: string
    path: string
    description?: string
  }>
  metadataOnlyRepos: Array<{
    name: string
    description: string
  }>
  isUnsure: boolean
}

interface WorkspaceStatus {
  success: boolean
  clonedRepos?: Array<{
    name: string
    path: string
    lastUpdated: number
  }>
  error?: string
}

// Expose protected methods that allow the renderer process to use
// ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // App info
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  platform: process.platform,

  // Auth
  auth: {
    login: (): Promise<AuthResult> => ipcRenderer.invoke('auth:login'),
    logout: (): Promise<{ success: boolean }> => ipcRenderer.invoke('auth:logout'),
    getState: (): Promise<AuthState> => ipcRenderer.invoke('auth:get-state'),
    onAuthSuccess: (callback: (user: { email: string; name: string }) => void) => {
      ipcRenderer.on('auth-success', (_event, tokens) => callback(tokens.user))
    },
  },

  // Settings
  settings: {
    get: (key?: string): Promise<Settings | unknown> => ipcRenderer.invoke('settings:get', key),
    set: (key: string, value: unknown): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('settings:set', key, value),
  },

  // Claude Code
      claude: {
        start: (prompt: string, workingDirectory?: string, workspaceConfig?: WorkspaceConfig): Promise<{ success: boolean }> =>
          ipcRenderer.invoke('claude:start', prompt, workingDirectory, workspaceConfig),
    stop: (): Promise<{ success: boolean }> => ipcRenderer.invoke('claude:stop'),
    isActive: (): Promise<boolean> => ipcRenderer.invoke('claude:is-active'),
    clearSession: (): Promise<{ success: boolean }> => ipcRenderer.invoke('claude:clear-session'),
    onOutput: (callback: (chunk: ClaudeOutputChunk) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, chunk: ClaudeOutputChunk) => callback(chunk)
      ipcRenderer.on('claude-output', handler)
      // Return cleanup function
      return () => ipcRenderer.removeListener('claude-output', handler)
    },
  },

  // GitHub
  github: {
    startAuth: (): Promise<GitHubAuthResult> => ipcRenderer.invoke('github:start-auth'),
    pollToken: (): Promise<GitHubAuthResult> => ipcRenderer.invoke('github:poll-token'),
    getState: (): Promise<GitHubState> => ipcRenderer.invoke('github:get-state'),
    logout: (): Promise<{ success: boolean }> => ipcRenderer.invoke('github:logout'),
    listRepos: (): Promise<GitHubReposResult> => ipcRenderer.invoke('github:list-repos'),
    openVerificationUri: (uri: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('github:open-verification-uri', uri),
    onAuthSuccess: (callback: (user: GitHubUser) => void) => {
      ipcRenderer.on('github-auth-success', (_event, data) => callback(data.user))
    },
  },

  // Workspace
  workspace: {
    getSelectableRepos: (): Promise<{ success: boolean; repos?: SelectableRepo[]; error?: string }> =>
      ipcRenderer.invoke('workspace:get-selectable-repos'),
    setup: (selectedRepos: string[], isUnsure: boolean): Promise<{ success: boolean; config?: WorkspaceConfig; error?: string }> =>
      ipcRenderer.invoke('workspace:setup', selectedRepos, isUnsure),
    getStatus: (): Promise<WorkspaceStatus> => ipcRenderer.invoke('workspace:get-status'),
    onProgress: (callback: (progress: WorkspaceProgress) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, progress: WorkspaceProgress) => callback(progress)
      ipcRenderer.on('workspace:progress', handler)
      return () => ipcRenderer.removeListener('workspace:progress', handler)
    },
  },
})

// Type declarations for the exposed API
declare global {
  interface Window {
    electronAPI: {
      getAppVersion: () => Promise<string>
      platform: NodeJS.Platform
      auth: {
        login: () => Promise<AuthResult>
        logout: () => Promise<{ success: boolean }>
        getState: () => Promise<AuthState>
        onAuthSuccess: (callback: (user: { email: string; name: string }) => void) => void
      }
      settings: {
        get: (key?: string) => Promise<Settings | unknown>
        set: (key: string, value: unknown) => Promise<{ success: boolean }>
      }
      claude: {
        start: (prompt: string, workingDirectory?: string, workspaceConfig?: WorkspaceConfig) => Promise<{ success: boolean }>
        stop: () => Promise<{ success: boolean }>
        isActive: () => Promise<boolean>
        clearSession: () => Promise<{ success: boolean }>
        onOutput: (callback: (chunk: ClaudeOutputChunk) => void) => () => void
      }
      github: {
        startAuth: () => Promise<GitHubAuthResult>
        pollToken: () => Promise<GitHubAuthResult>
        getState: () => Promise<GitHubState>
        logout: () => Promise<{ success: boolean }>
        listRepos: () => Promise<GitHubReposResult>
        openVerificationUri: (uri: string) => Promise<{ success: boolean }>
        onAuthSuccess: (callback: (user: GitHubUser) => void) => void
      }
      workspace: {
        getSelectableRepos: () => Promise<{ success: boolean; repos?: SelectableRepo[]; error?: string }>
        setup: (selectedRepos: string[], isUnsure: boolean) => Promise<{ success: boolean; config?: WorkspaceConfig; error?: string }>
        getStatus: () => Promise<WorkspaceStatus>
        onProgress: (callback: (progress: WorkspaceProgress) => void) => () => void
      }
    }
  }
}
