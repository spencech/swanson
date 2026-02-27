import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import { login, logout, getAuthState, stopAuthServer } from './auth'
import { getSetting, setSetting, getSettings, getServerConfig, setServerConfig } from './store'
import { configure, connect, disconnect, getConnectionState, sendChat, stopChat, isActive } from './ws-client'

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

// ─── IPC Handlers ──────────────────────────────────────────────────────────────

// App info
ipcMain.handle('get-app-version', () => {
  return app.getVersion()
})

// Auth handlers (Google SSO)
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

// ─── OpenClaw Handlers ─────────────────────────────────────────────────────────

ipcMain.handle('openclaw:connect', async () => {
  const serverConfig = getServerConfig()
  const authState = getAuthState()
  const userEmail = authState?.user?.email || 'unknown'

  configure(serverConfig.url, serverConfig.token, userEmail)
  const result = await connect()

  if (result.success && mainWindow) {
    mainWindow.webContents.send('openclaw-message', {
      type: 'status',
      sessionId: '',
      payload: { state: 'connected', message: 'Connected to OpenClaw server' },
      timestamp: new Date().toISOString(),
    })
  }

  return result
})

ipcMain.handle('openclaw:send', async (_event, content: string, threadId?: string) => {
  if (!mainWindow) throw new Error('No main window')
  await sendChat(mainWindow, content, threadId)
  return { success: true }
})

ipcMain.handle('openclaw:stop', () => {
  stopChat()
  return { success: true }
})

ipcMain.handle('openclaw:disconnect', () => {
  disconnect()
  return { success: true }
})

ipcMain.handle('openclaw:status', () => {
  return { state: getConnectionState() }
})

ipcMain.handle('openclaw:is-active', () => {
  return isActive()
})

ipcMain.handle('openclaw:set-server', (_event, url: string, token: string) => {
  setServerConfig({ url, token })
  return { success: true }
})

ipcMain.handle('openclaw:get-server', () => {
  return getServerConfig()
})

// ─── Cleanup ───────────────────────────────────────────────────────────────────

app.on('before-quit', () => {
  stopAuthServer()
  disconnect()
})
