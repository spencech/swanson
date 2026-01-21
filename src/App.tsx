import { useEffect, useState } from 'react'
import { useAuth } from './hooks/useAuth'
import { useSettings } from './hooks/useSettings'
import { LaunchScreen } from './components/LaunchScreen'
import { ChatContainer } from './components/ChatContainer'

interface WorkspaceConfig {
  checkedOutRepos: Array<{ name: string; path: string; description?: string }>
  metadataOnlyRepos: Array<{ name: string; description: string }>
  isUnsure: boolean
}

function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [appVersion, setAppVersion] = useState<string>('')
  const [workspaceReady, setWorkspaceReady] = useState(false)
  const [workspaceConfig, setWorkspaceConfig] = useState<WorkspaceConfig | null>(null)

  const {
    isAuthenticated,
    isLoading: authLoading,
    user,
    error: authError,
    login,
    logout,
    isGoogleConnected,
    isGitHubConnected,
  } = useAuth()
  const { settings, isLoading: settingsLoading, updateSetting } = useSettings()

  // Load theme from settings
  useEffect(() => {
    if (settings?.theme) {
      setTheme(settings.theme)
    } else {
      // Check system preference
      const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null
      if (savedTheme) {
        setTheme(savedTheme)
      } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
        setTheme('dark')
      }
    }
  }, [settings?.theme])

  // Apply theme to document
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
    localStorage.setItem('theme', theme)
  }, [theme])

  // Get app version
  useEffect(() => {
    window.electronAPI?.getAppVersion().then(setAppVersion)
  }, [])

  const toggleTheme = async () => {
    const newTheme = theme === 'light' ? 'dark' : 'light'
    setTheme(newTheme)
    await updateSetting('theme', newTheme)
  }

  const isLoading = authLoading || settingsLoading
  
  // Log app state
  useEffect(() => {
    console.log('App: Render state', {
      isLoading,
      isAuthenticated,
      isGoogleConnected,
      isGitHubConnected,
      hasUser: !!user,
    })
  }, [isLoading, isAuthenticated, isGoogleConnected, isGitHubConnected, user])

  return (
    <div className="h-screen flex flex-col bg-light-bg dark:bg-dark-bg text-light-text-primary dark:text-dark-text-primary">
      {/* Title bar / drag region */}
      <div className="drag-region h-12 flex items-center justify-between px-4 border-b border-light-border dark:border-dark-border">
        <div className="flex items-center gap-2 pl-16">
          <span className="font-semibold text-lg">Swanson</span>
          {appVersion && (
            <span className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
              v{appVersion}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {isAuthenticated && user && (
            <div className="flex items-center gap-2 no-drag">
              {/* User avatar */}
              <div className="w-7 h-7 rounded-full bg-light-accent dark:bg-dark-accent flex items-center justify-center text-white text-sm font-medium">
                {(user.name || user.email).charAt(0).toUpperCase()}
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-medium text-light-text-primary dark:text-dark-text-primary leading-tight">
                  {user.name || user.email.split('@')[0]}
                </span>
                <span className="text-xs text-light-text-secondary dark:text-dark-text-secondary leading-tight">
                  {user.email}
                </span>
              </div>
              <button
                onClick={logout}
                className="ml-2 px-3 py-1 text-sm rounded-lg hover:bg-light-surface dark:hover:bg-dark-surface transition-colors text-light-text-secondary dark:text-dark-text-secondary"
              >
                Sign out
              </button>
            </div>
          )}
          <button
            onClick={toggleTheme}
            className="no-drag p-2 rounded-lg hover:bg-light-surface dark:hover:bg-dark-surface transition-colors"
            aria-label="Toggle theme"
          >
            {theme === 'light' ? (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Main content */}
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-light-accent dark:border-dark-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : !workspaceReady ? (
        <LaunchScreen
          onWorkspaceReady={(config) => {
            setWorkspaceConfig(config)
            setWorkspaceReady(true)
          }}
        />
      ) : (
        <ChatContainer workspaceConfig={workspaceConfig} />
      )}
    </div>
  )
}

export default App
