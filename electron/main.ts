import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import { login, logout, getAuthState, stopAuthServer } from './auth'
import { getSetting, setSetting, getSettings } from './store'
import { startClaudeSession, stopClaudeSession, isClaudeSessionActive, clearClaudeSession } from './claude-code'

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
ipcMain.handle('claude:start', (_event, prompt: string, workingDirectory?: string) => {
  if (!mainWindow) throw new Error('No main window')
  startClaudeSession(mainWindow, prompt, workingDirectory)
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

// Cleanup on app quit
app.on('before-quit', () => {
  stopAuthServer()
  stopClaudeSession()
})
