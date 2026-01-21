import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import { login, logout, getAuthState, stopAuthServer } from './auth'
import { getSetting, setSetting, getSettings, getGitHubAuth, clearGitHubAuth, setGitHubAuth } from './store'
import { startClaudeSession, stopClaudeSession, isClaudeSessionActive, clearClaudeSession } from './claude-code'
import { startGitHubDeviceFlow, pollDeviceCodeToken } from './github-auth'
import { getAuthenticatedUser } from './github-api'
import { loadRepositories, SELECTABLE_REPOS, AUTOMATIC_REPOS, getRepoMetadata, formatRepoContextWithPaths } from './repos'
import { ensureRepo } from './git-ops'
import { getClonedRepos } from './store'

// ESM compatibility for __dirname
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let mainWindow: BrowserWindow | null = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 15, y: 15 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // Load the app
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

// IPC handlers

// App info
ipcMain.handle('get-app-version', () => {
  return app.getVersion()
})

// Auth handlers
ipcMain.handle('auth:login', async () => {
  if (!mainWindow) throw new Error('No main window')
  try {
    const tokens = await login(mainWindow)
    return { success: true, user: tokens.user }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
})

ipcMain.handle('auth:logout', () => {
  logout()
  return { success: true }
})

ipcMain.handle('auth:get-state', () => {
  return getAuthState()
})

// GitHub handlers
ipcMain.handle('github:start-auth', async () => {
  if (!mainWindow) throw new Error('No main window')
  try {
    const flow = await startGitHubDeviceFlow()
    return {
      success: true,
      userCode: flow.userCode,
      verificationUri: flow.verificationUri,
    }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
})

ipcMain.handle('github:open-verification-uri', async (_event, uri: string) => {
  const { shell } = await import('electron')
  await shell.openExternal(uri)
  return { success: true }
})

ipcMain.handle('github:poll-token', async () => {
  console.log('github:poll-token: IPC handler called')
  try {
    // Poll using stored device code (doesn't start a new flow)
    console.log('github:poll-token: About to call pollDeviceCodeToken')
    const tokenData = await pollDeviceCodeToken()
    console.log('github:poll-token: pollDeviceCodeToken succeeded', { hasToken: !!tokenData })
    
    // Only fetch user info if we successfully got a token
    // (pollDeviceCodeToken throws AUTHORIZATION_PENDING if still waiting)
    console.log('github:poll-token: About to call getAuthenticatedUser')
    const user = await getAuthenticatedUser()
    console.log('github:poll-token: getAuthenticatedUser succeeded', { user: user.login })
    
    // Update store with user info and clear device code (only after everything succeeds)
    setGitHubAuth({
      user: {
        login: user.login,
        name: user.name,
        avatarUrl: user.avatar_url,
      },
      // Clear device code now that we have token and user info
      deviceCode: undefined,
      deviceCodeExpiresAt: undefined,
      deviceCodeInterval: undefined,
    })

    console.log('github:poll-token: Stored user info and cleared device code')

    if (mainWindow) {
      console.log('github:poll-token: Sending github-auth-success event')
      mainWindow.webContents.send('github-auth-success', {
        user: {
          login: user.login,
          name: user.name,
          avatarUrl: user.avatar_url,
        },
      })
    }

    const response = {
      success: true,
      user: {
        login: user.login,
        name: user.name,
        avatarUrl: user.avatar_url,
      },
    }
    console.log('github:poll-token: Returning success response', response)
    return response
  } catch (error) {
    const errorMessage = (error as Error).message
    // Return pending status for expected polling states
    if (
      errorMessage === 'AUTHORIZATION_PENDING' ||
      errorMessage === 'SLOW_DOWN' ||
      errorMessage.includes('authorization_pending') ||
      errorMessage.includes('slow_down')
    ) {
      // Get the current interval from store to return to frontend
      const auth = getGitHubAuth()
      return { 
        success: false, 
        pending: true, 
        error: null,
        recommendedInterval: auth?.deviceCodeInterval || 5, // Return current interval in seconds
      }
    }
    // Log other errors for debugging
    console.error('GitHub poll error:', errorMessage)
    return { success: false, error: errorMessage }
  }
})

ipcMain.handle('github:get-state', async () => {
  const auth = getGitHubAuth()
  
  // Clear expired device codes immediately
  if (auth?.deviceCode && auth.deviceCodeExpiresAt && Date.now() >= auth.deviceCodeExpiresAt) {
    console.log('github:get-state: Clearing expired device code')
    setGitHubAuth({
      deviceCode: undefined,
      deviceCodeExpiresAt: undefined,
      deviceCodeInterval: undefined,
    })
  }
  
  if (!auth?.accessToken) {
    return {
      isConnected: false,
      user: null,
    }
  }

  try {
    // Verify token is still valid by fetching user
    const user = await getAuthenticatedUser()
    return {
      isConnected: true,
      user: {
        login: user.login,
        name: user.name,
        avatarUrl: user.avatar_url,
      },
    }
  } catch (error) {
    // Token invalid or expired - clear tokens and device codes
    console.log('github:get-state: Token invalid, clearing auth state')
    setGitHubAuth({
      accessToken: undefined,
      refreshToken: undefined,
      expiresAt: undefined,
      user: undefined,
      deviceCode: undefined,
      deviceCodeExpiresAt: undefined,
      deviceCodeInterval: undefined,
    })
    return {
      isConnected: false,
      user: null,
    }
  }
})

ipcMain.handle('github:logout', () => {
  console.log('github:logout: Logging out GitHub')
  clearGitHubAuth()
  // Verify logout completed
  const verify = getGitHubAuth()
  if (Object.keys(verify).length > 0) {
    console.warn('github:logout: Warning - some auth state remains after logout', Object.keys(verify))
  }
  console.log('github:logout: Logout complete')
  return { success: true }
})

ipcMain.handle('github:list-repos', async () => {
  try {
    const repos = await loadRepositories()
    return { success: true, repos }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
})

// Settings handlers
ipcMain.handle('settings:get', (_event, key?: string) => {
  if (key) {
    return getSetting(key as keyof ReturnType<typeof getSettings>)
  }
  return getSettings()
})

ipcMain.handle('settings:set', (_event, key: string, value: unknown) => {
  setSetting(key as keyof ReturnType<typeof getSettings>, value as never)
  return { success: true }
})

// Claude Code handlers
ipcMain.handle('claude:start', (_event, prompt: string, workingDirectory?: string, workspaceConfig?: unknown) => {
  if (!mainWindow) throw new Error('No main window')
  startClaudeSession(mainWindow, prompt, workingDirectory, workspaceConfig as any)
  return { success: true }
})

ipcMain.handle('claude:stop', () => {
  stopClaudeSession()
  return { success: true }
})

ipcMain.handle('claude:is-active', () => {
  return isClaudeSessionActive()
})

ipcMain.handle('claude:clear-session', () => {
  clearClaudeSession()
  return { success: true }
})

// Workspace handlers
ipcMain.handle('workspace:get-selectable-repos', async () => {
  try {
    // Load descriptions from GitHub API
    const reposWithDescriptions = await Promise.all(
      SELECTABLE_REPOS.map(async (repo) => {
        const description = await getRepoMetadata(repo.name)
        return {
          name: repo.name,
          url: repo.url,
          description: description || '',
        }
      })
    )
    return { success: true, repos: reposWithDescriptions }
  } catch (error) {
    // Fallback to repos without descriptions if GitHub API fails
    return {
      success: true,
      repos: SELECTABLE_REPOS.map((repo) => ({
        name: repo.name,
        url: repo.url,
        description: '',
      })),
    }
  }
})

ipcMain.handle('workspace:setup', async (event, selectedRepoNames: string[], isUnsure: boolean) => {
  if (!mainWindow) throw new Error('No main window')

  try {
    const reposToClone: Array<{ url: string; name: string }> = []
    
    // Always clone automatic repos
    reposToClone.push(...AUTOMATIC_REPOS)
    
    // Clone selected repos unless user is unsure
    if (!isUnsure && selectedRepoNames.length > 0) {
      const selectedRepos = SELECTABLE_REPOS.filter((repo) => selectedRepoNames.includes(repo.name))
      reposToClone.push(...selectedRepos)
    }

    // Send initial progress
    mainWindow.webContents.send('workspace:progress', {
      total: reposToClone.length,
      completed: 0,
      current: '',
      repos: reposToClone.map((repo) => ({
        name: repo.name,
        status: 'pending' as const,
      })),
    })

    // Track progress as repos complete
    let completedCount = 0
    const results: Array<{ success: boolean; repoName: string; localPath: string; error?: string }> = []

    // Clone repos in parallel, updating progress as each completes
    await Promise.all(
      reposToClone.map(async (repo) => {
        // Update status to cloning
        mainWindow?.webContents.send('workspace:progress', {
          total: reposToClone.length,
          completed: completedCount,
          current: repo.name,
          repos: reposToClone.map((r) => ({
            name: r.name,
            status: results.find((res) => res.repoName === r.name)?.success
              ? ('done' as const)
              : r.name === repo.name
              ? ('cloning' as const)
              : results.find((res) => res.repoName === r.name)
              ? ('error' as const)
              : ('pending' as const),
            error: results.find((res) => res.repoName === r.name && !res.success)?.error,
          })),
        })

        const result = await ensureRepo(repo.url, repo.name)
        results.push(result)
        completedCount++

        // Update status after completion
        mainWindow?.webContents.send('workspace:progress', {
          total: reposToClone.length,
          completed: completedCount,
          current: repo.name,
          repos: reposToClone.map((r) => {
            const res = results.find((res) => res.repoName === r.name)
            return {
              name: r.name,
              status: res?.success ? ('done' as const) : res ? ('error' as const) : ('pending' as const),
              error: res?.error,
            }
          }),
        })

        return result
      })
    )

    // Get metadata for repos that weren't cloned (if unsure)
    let metadataOnlyRepos: Array<{ name: string; description: string }> = []
    if (isUnsure) {
      try {
        const allRepos = await loadRepositories()
        const selectedRepos = SELECTABLE_REPOS.filter((repo) => selectedRepoNames.includes(repo.name))
        metadataOnlyRepos = await Promise.all(
          selectedRepos.map(async (repo) => {
            const description = await getRepoMetadata(repo.name) || ''
            return { name: repo.name, description }
          })
        )
      } catch (error) {
        // Ignore metadata errors
      }
    }

    // Build workspace config
    const clonedRepos = getClonedRepos()
    const checkedOutRepos = results
      .filter((r) => r.success)
      .map((r) => ({
        name: r.repoName,
        path: r.localPath,
        description: metadataOnlyRepos.find((m) => m.name === r.repoName)?.description,
      }))

    const workspaceConfig = {
      checkedOutRepos,
      metadataOnlyRepos: metadataOnlyRepos.map((r) => ({
        name: r.name,
        description: r.description,
      })),
      isUnsure,
    }

    // Send final progress
    mainWindow.webContents.send('workspace:progress', {
      total: reposToClone.length,
      completed: reposToClone.length,
      current: '',
      repos: reposToClone.map((repo) => {
        const result = results.find((r) => r.repoName === repo.name)
        return {
          name: repo.name,
          status: result?.success ? 'done' as const : 'error' as const,
          error: result?.error,
        }
      }),
    })

    return { success: true, config: workspaceConfig }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
})

ipcMain.handle('workspace:get-status', async () => {
  const clonedRepos = getClonedRepos()
  return {
    success: true,
    clonedRepos: Object.entries(clonedRepos).map(([name, info]) => ({
      name,
      path: info.path,
      lastUpdated: info.lastUpdated,
    })),
  }
})

// Cleanup on app quit
app.on('before-quit', () => {
  stopAuthServer()
  stopClaudeSession()
})
