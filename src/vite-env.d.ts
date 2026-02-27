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
    openclaw: {
      connect: () => Promise<{ success: boolean; error?: string }>
      send: (content: string, threadId?: string) => Promise<{ success: boolean }>
      stop: () => Promise<{ success: boolean }>
      disconnect: () => Promise<{ success: boolean }>
      status: () => Promise<{ state: string }>
      isActive: () => Promise<boolean>
      setServer: (url: string, token: string) => Promise<{ success: boolean }>
      getServer: () => Promise<{ url: string; token: string }>
      onMessage: (callback: (message: unknown) => void) => () => void
    }
  }
}
