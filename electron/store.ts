import Store from 'electron-store'

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
    jiraEmail?: string
    jiraApiToken?: string
  }
}

const store = new Store<StoreSchema>({
  name: 'swanson-config',
  encryptionKey: 'swanson-secure-storage-key', // In production, use a more secure approach
  defaults: {
    auth: {},
    settings: {
      theme: 'light',
    },
  },
})

export function getAuth() {
  return store.get('auth')
}

export function setAuth(auth: StoreSchema['auth']) {
  store.set('auth', auth)
}

export function clearAuth() {
  store.set('auth', {})
}

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

export default store
