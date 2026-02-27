import Store from 'electron-store'
import type { IPlanSummary, IThreadSummary } from '../shared/types'

interface StoreSchema {
  auth: {
    accessToken?: string
    refreshToken?: string
    user?: {
      email: string
      name: string
    }
  }
  settings: {
    theme: 'light' | 'dark'
    ssoUrl?: string
  }
  server: {
    url: string
    token: string
  }
  threadsCache: IThreadSummary[]
  plansCache: IPlanSummary[]
}

const store = new Store<StoreSchema>({
  name: 'swanson-config',
  encryptionKey: 'swanson-secure-storage-key',
  defaults: {
    auth: {},
    settings: {
      theme: 'light',
    },
    server: {
      url: 'http://localhost:18790',
      token: 'swanson-dev-token',
    },
    threadsCache: [],
    plansCache: [],
  },
})

// Auth functions
export function getAuth() {
  return store.get('auth')
}

export function setAuth(auth: StoreSchema['auth']) {
  store.set('auth', auth)
}

export function clearAuth() {
  store.set('auth', {})
}

// Settings functions
export function getSettings() {
  return store.get('settings')
}

export function setSetting<K extends keyof StoreSchema['settings']>(
  key: K,
  value: StoreSchema['settings'][K]
) {
  store.set(`settings.${key}`, value)
}

export function getSetting<K extends keyof StoreSchema['settings']>(
  key: K
): StoreSchema['settings'][K] {
  return store.get(`settings.${key}`)
}

// Server config functions
export function getServerConfig(): StoreSchema['server'] {
  return store.get('server', { url: 'http://localhost:18790', token: 'swanson-dev-token' })
}

export function setServerConfig(config: Partial<StoreSchema['server']>): void {
  const current = getServerConfig()
  store.set('server', { ...current, ...config })
}

// Cache functions for sidebar instant population
export function getThreadsCache(): IThreadSummary[] {
  return store.get('threadsCache', [])
}

export function setThreadsCache(threads: IThreadSummary[]): void {
  store.set('threadsCache', threads)
}

export function getPlansCache(): IPlanSummary[] {
  return store.get('plansCache', [])
}

export function setPlansCache(plans: IPlanSummary[]): void {
  store.set('plansCache', plans)
}

export default store
