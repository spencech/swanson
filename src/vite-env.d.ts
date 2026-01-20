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
      start: (prompt: string) => Promise<{ success: boolean }>
      stop: () => Promise<{ success: boolean }>
      isActive: () => Promise<boolean>
      onOutput: (callback: (chunk: ClaudeOutputChunk) => void) => () => void
    }
  }
}
