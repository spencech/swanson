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

// Expose protected methods that allow the renderer process to use
// ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // App info
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  platform: process.platform,

  // Auth (Google SSO)
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

  // OpenClaw
  openclaw: {
    connect: (): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('openclaw:connect'),
    send: (content: string, threadId?: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('openclaw:send', content, threadId),
    stop: (): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('openclaw:stop'),
    disconnect: (): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('openclaw:disconnect'),
    status: (): Promise<{ state: string }> =>
      ipcRenderer.invoke('openclaw:status'),
    isActive: (): Promise<boolean> =>
      ipcRenderer.invoke('openclaw:is-active'),
    setServer: (url: string, token: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('openclaw:set-server', url, token),
    getServer: (): Promise<{ url: string; token: string }> =>
      ipcRenderer.invoke('openclaw:get-server'),
    onMessage: (callback: (message: unknown) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, message: unknown) => callback(message)
      ipcRenderer.on('openclaw-message', handler)
      return () => ipcRenderer.removeListener('openclaw-message', handler)
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
}
