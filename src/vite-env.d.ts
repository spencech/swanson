/// <reference types="vite/client" />

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
  ssoUrl?: string
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
      start: (prompt: string, workingDirectory?: string) => Promise<{ success: boolean }>
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
  }
}
