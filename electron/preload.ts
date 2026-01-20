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
    start: (prompt: string, workingDirectory?: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('claude:start', prompt, workingDirectory),
    stop: (): Promise<{ success: boolean }> => ipcRenderer.invoke('claude:stop'),
    isActive: (): Promise<boolean> => ipcRenderer.invoke('claude:is-active'),
    onOutput: (callback: (chunk: ClaudeOutputChunk) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, chunk: ClaudeOutputChunk) => callback(chunk)
      ipcRenderer.on('claude-output', handler)
      // Return cleanup function
      return () => ipcRenderer.removeListener('claude-output', handler)
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
        start: (prompt: string, workingDirectory?: string) => Promise<{ success: boolean }>
        stop: () => Promise<{ success: boolean }>
        isActive: () => Promise<boolean>
        onOutput: (callback: (chunk: ClaudeOutputChunk) => void) => () => void
      }
    }
  }
}
