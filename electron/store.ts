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
  github: {
    accessToken?: string
    refreshToken?: string
    expiresAt?: number
    deviceCode?: string // Temporary storage for device code during auth flow
    deviceCodeExpiresAt?: number
    deviceCodeInterval?: number
    user?: {
      login: string
      name: string
      avatarUrl: string
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

// GitHub auth functions
export function getGitHubAuth(): StoreSchema['github'] {
  const auth = store.get('github', {})
  // Debug logging for device code checks
  if (auth && Object.keys(auth).length > 0) {
    console.log('getGitHubAuth: Retrieved auth', {
      keys: Object.keys(auth),
      hasDeviceCode: !!auth.deviceCode,
      hasAccessToken: !!auth.accessToken,
    })
  }
  return auth
}

export function setGitHubAuth(auth: Partial<StoreSchema['github']>) {
  const current = getGitHubAuth()
  const merged = { ...current, ...auth }
  
  // Remove undefined values to actually delete keys from store
  const cleaned: StoreSchema['github'] = {}
  for (const [key, value] of Object.entries(merged)) {
    if (value !== undefined) {
      cleaned[key as keyof StoreSchema['github']] = value as any
    }
  }
  
  console.log('setGitHubAuth: Setting auth', {
    currentKeys: Object.keys(current),
    newKeys: Object.keys(auth),
    newValues: Object.fromEntries(
      Object.entries(auth).map(([k, v]) => [
        k,
        k === 'accessToken' || k === 'refreshToken' ? (v ? `${String(v).substring(0, 10)}...` : 'undefined') : v
      ])
    ),
    cleanedKeys: Object.keys(cleaned),
    cleanedValues: Object.fromEntries(
      Object.entries(cleaned).map(([k, v]) => [
        k,
        k === 'accessToken' || k === 'refreshToken' ? (v ? `${String(v).substring(0, 10)}...` : 'undefined') : v
      ])
    ),
    hasDeviceCode: !!cleaned.deviceCode,
    hasAccessToken: !!cleaned.accessToken,
  })
  store.set('github', cleaned)
  
  // Verify it was stored
  const verify = store.get('github', {})
  console.log('setGitHubAuth: Verification after store.set', {
    storedKeys: Object.keys(verify),
    hasAccessToken: !!verify.accessToken,
    hasDeviceCode: !!verify.deviceCode,
  })
  
  if (!verify.deviceCode && auth.deviceCode) {
    console.error('setGitHubAuth: Device code was not stored!', {
      requested: auth.deviceCode?.substring(0, 10) + '...',
      stored: verify,
    })
  }
  
  if (!verify.accessToken && auth.accessToken) {
    console.error('setGitHubAuth: Access token was not stored!', {
      requested: auth.accessToken?.substring(0, 10) + '...',
      stored: verify,
    })
  }
}

export function clearGitHubAuth() {
  console.log('clearGitHubAuth: Clearing all GitHub auth state')
  // Explicitly clear everything including device codes
  store.set('github', {
    accessToken: undefined,
    refreshToken: undefined,
    expiresAt: undefined,
    deviceCode: undefined,
    deviceCodeExpiresAt: undefined,
    deviceCodeInterval: undefined,
    user: undefined,
  })
  // Verify it was cleared
  const verify = store.get('github', {})
  if (Object.keys(verify).length > 0) {
    console.warn('clearGitHubAuth: Warning - some keys remain after clear', Object.keys(verify))
    // Force clear by setting empty object
    store.set('github', {})
  }
  console.log('clearGitHubAuth: GitHub auth state cleared')
}

export default store
