import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useGitHub } from '../hooks/useGitHub'
import { useWorkspace } from '../hooks/useWorkspace'

interface LaunchScreenProps {
  onWorkspaceReady: (config: {
    checkedOutRepos: Array<{ name: string; path: string; description?: string }>
    metadataOnlyRepos: Array<{ name: string; description: string }>
    isUnsure: boolean
  }) => void
}

type LaunchStep = 'google' | 'github' | 'repos' | 'setup'

// Human-friendly labels for repositories
const REPO_LABELS: Record<string, string> = {
  'upbeat-admin-portal': 'Admin Portal',
  'upbeat-district-administration': 'District Administration',
  'upbeat-reports': 'Reports',
  'upbeat-survey-administration': 'Survey Administration',
  'upbeat-survey-editor': 'Survey Editor',
  'upbeat-user-administration': 'User Administration',
  'upbeat-survey-legacy': 'Survey (Legacy)',
  'upbeat-pdf-generator': 'PDF Generator',
  'upbeat-presentation-generator': 'Presentation Generator',
}

// Helper to get human-friendly label for a repo
const getRepoLabel = (repoName: string): string => {
  return REPO_LABELS[repoName] || repoName
}

export function LaunchScreen({ onWorkspaceReady }: LaunchScreenProps) {
  const auth = useAuth()
  const github = useGitHub()
  const workspace = useWorkspace()
  
  const [currentStep, setCurrentStep] = useState<LaunchStep>('google')
  const [selectedRepos, setSelectedRepos] = useState<string[]>([])
  const [isUnsure, setIsUnsure] = useState(false)
  const [deviceCode, setDeviceCode] = useState<string | null>(null)
  const [verificationUri, setVerificationUri] = useState<string | null>(null)
  const [isPolling, setIsPolling] = useState(false)
  const [pollError, setPollError] = useState<string | null>(null)
  const hasStartedFlow = useRef(false)

  // Format user code for display (XXXX-XXXX)
  const formatUserCode = (code: string) => {
    if (!code) return ''
    const cleanCode = code.replace(/[-\s]/g, '')
    if (cleanCode.length >= 8) {
      return `${cleanCode.slice(0, 4)}-${cleanCode.slice(4, 8)}`
    }
    const mid = Math.floor(cleanCode.length / 2)
    return `${cleanCode.slice(0, mid)}-${cleanCode.slice(mid)}`
  }

  // Determine current step based on auth state
  useEffect(() => {
    if (!auth.isGoogleConnected) {
      setCurrentStep('google')
    } else if (!github.isConnected) {
      setCurrentStep('github')
    } else {
      setCurrentStep('repos')
    }
  }, [auth.isGoogleConnected, github.isConnected])

  // GitHub Device Flow polling
  useEffect(() => {
    if (!deviceCode || !isPolling) return

    let pollInterval: NodeJS.Timeout | null = null
    let timeoutId: NodeJS.Timeout | null = null
    let isCleanedUp = false

    const startPolling = async () => {
      await new Promise((resolve) => setTimeout(resolve, 5000))

      if (isCleanedUp) return

      const doPoll = async () => {
        if (isCleanedUp) return

        try {
          const result = await window.electronAPI?.github?.pollToken()
          if (!result) return

          if (result.success && result.user) {
            if (pollInterval) {
              clearInterval(pollInterval)
              pollInterval = null
            }
            setIsPolling(false)
            await new Promise((resolve) => setTimeout(resolve, 100))
            return
          }
        } catch (err) {
          const errorMessage = (err as Error).message
          if (
            errorMessage.includes('AUTHORIZATION_PENDING') ||
            errorMessage.includes('SLOW_DOWN') ||
            errorMessage.includes('pending') ||
            errorMessage.includes('GitHub not connected')
          ) {
            return
          }
          
          if (pollInterval) {
            clearInterval(pollInterval)
            pollInterval = null
          }
          setIsPolling(false)
          setPollError(errorMessage)
        }
      }

      doPoll()

      let currentPollInterval = 5000
      const scheduleNextPoll = () => {
        if (pollInterval) {
          clearInterval(pollInterval)
        }
        pollInterval = setInterval(() => {
          doPoll()
        }, currentPollInterval)
      }
      scheduleNextPoll()

      timeoutId = setTimeout(() => {
        if (pollInterval) {
          clearInterval(pollInterval)
          pollInterval = null
        }
        setIsPolling(false)
        setPollError('Authentication timed out. Please try again.')
      }, 15 * 60 * 1000)
    }

    startPolling()

    return () => {
      isCleanedUp = true
      if (pollInterval) {
        clearInterval(pollInterval)
      }
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
    }
  }, [deviceCode, isPolling])

  // Reset GitHub flow state when connected
  useEffect(() => {
    if (github.isConnected) {
      hasStartedFlow.current = false
      setDeviceCode(null)
      setVerificationUri(null)
      setIsPolling(false)
      setPollError(null)
    }
  }, [github.isConnected])

  const handleGoogleLogin = async () => {
    await auth.login()
  }

  const handleStartGitHubAuth = async () => {
    if (hasStartedFlow.current || isPolling) return

    hasStartedFlow.current = true
    setPollError(null)

    try {
      const flow = await github.connect()
      if (flow) {
        setDeviceCode(flow.userCode)
        setVerificationUri(flow.verificationUri)
        setIsPolling(true)
      }
    } catch (err) {
      setPollError((err as Error).message)
      hasStartedFlow.current = false
    }
  }

  const handleOpenGitHub = async () => {
    if (verificationUri) {
      if (window.electronAPI?.github) {
        await window.electronAPI.github.openVerificationUri(verificationUri)
      } else {
        window.open(verificationUri, '_blank')
      }
    }
  }

  const handleRepoToggle = (repoName: string) => {
    if (repoName === 'unsure') {
      setIsUnsure(!isUnsure)
      setSelectedRepos([])
    } else {
      setIsUnsure(false)
      setSelectedRepos((prev) =>
        prev.includes(repoName) ? prev.filter((r) => r !== repoName) : [...prev, repoName]
      )
    }
  }

  const handleContinue = async () => {
    if (isUnsure || selectedRepos.length > 0) {
      setCurrentStep('setup')
      const config = await workspace.setup(selectedRepos, isUnsure)
      if (config) {
        onWorkspaceReady(config)
      }
    }
  }

  const canContinue = isUnsure || selectedRepos.length > 0

  return (
    <div className="flex-1 flex items-center justify-center bg-light-bg dark:bg-dark-bg">
      <div className="w-full max-w-md px-8">
        {/* Step 1: Google SSO */}
        {currentStep === 'google' && (
          <div className="space-y-4">
            <div className="text-center mb-8">
              <h1 className="text-4xl font-bold text-light-text-primary dark:text-dark-text-primary mb-2">
                Swanson
              </h1>
              <p className="text-light-text-secondary dark:text-dark-text-secondary">
                Generate spawnee plans through conversation
              </p>
            </div>
            <div className="text-sm text-light-text-secondary dark:text-dark-text-secondary mb-4">
              Step 1 of 3: Sign in with Google
            </div>
            <button
              onClick={handleGoogleLogin}
              disabled={auth.isLoading}
              className="w-full flex items-center justify-center gap-3 px-6 py-3 rounded-lg bg-white dark:bg-dark-surface border border-light-border dark:border-dark-border hover:bg-light-surface dark:hover:bg-dark-border transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {auth.isLoading ? (
                <>
                  <div className="w-5 h-5 border-2 border-light-text-secondary border-t-transparent rounded-full animate-spin" />
                  <span className="text-light-text-primary dark:text-dark-text-primary">Signing in...</span>
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>
                  <span className="text-light-text-primary dark:text-dark-text-primary font-medium">
                    Sign in with Google
                  </span>
                </>
              )}
            </button>
            {auth.error && (
              <div className="mt-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                <p className="text-sm text-red-600 dark:text-red-400">{auth.error}</p>
              </div>
            )}
          </div>
        )}

        {/* Step 2: GitHub Device Flow */}
        {currentStep === 'github' && (
          <div className="space-y-4">
            <div className="text-sm text-light-text-secondary dark:text-dark-text-secondary mb-4">
              Step 2 of 3: Connect GitHub
            </div>

            {!deviceCode ? (
              <button
                onClick={handleStartGitHubAuth}
                disabled={isPolling || github.isLoading}
                className="w-full flex items-center justify-center gap-3 px-6 py-3 rounded-lg bg-white dark:bg-dark-surface border border-light-border dark:border-dark-border hover:bg-light-surface dark:hover:bg-dark-border transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {github.isLoading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-light-text-secondary border-t-transparent rounded-full animate-spin" />
                    <span className="text-light-text-primary dark:text-dark-text-primary">Connecting...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                    </svg>
                    <span className="text-light-text-primary dark:text-dark-text-primary font-medium">
                      Connect GitHub
                    </span>
                  </>
                )}
              </button>
            ) : (
              <div className="space-y-4">
                <div className="p-4 rounded-lg bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border">
                  <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary mb-3">
                    Enter this code on GitHub:
                  </p>
                  <div className="text-center">
                    <div className="inline-block px-6 py-3 rounded-lg bg-white dark:bg-dark-bg border-2 border-light-accent dark:border-dark-accent">
                      <span className="text-2xl font-mono font-bold text-light-text-primary dark:text-dark-text-primary tracking-wider">
                        {formatUserCode(deviceCode)}
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleOpenGitHub}
                  className="w-full flex items-center justify-center gap-3 px-6 py-3 rounded-lg bg-white dark:bg-dark-surface border border-light-border dark:border-dark-border hover:bg-light-surface dark:hover:bg-dark-border transition-colors"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                  </svg>
                  <span className="text-light-text-primary dark:text-dark-text-primary font-medium">
                    Open GitHub
                  </span>
                </button>

                {isPolling && (
                  <div className="flex items-center justify-center gap-2 text-sm text-light-text-secondary dark:text-dark-text-secondary">
                    <div className="w-4 h-4 border-2 border-light-text-secondary border-t-transparent rounded-full animate-spin" />
                    <span>Waiting for authorization...</span>
                  </div>
                )}

                {pollError && (
                  <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                    <p className="text-sm text-red-600 dark:text-red-400">{pollError}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Step 3: Repository Selection */}
        {currentStep === 'repos' && (
          <div className="space-y-4">
            <div className="text-center mb-6">
              <h1 className="text-3xl font-bold text-light-text-primary dark:text-dark-text-primary mb-2">
                {auth.user ? `Welcome back, ${auth.user.name || auth.user.email.split('@')[0]}!` : 'Select Repositories'}
              </h1>
              <p className="text-light-text-secondary dark:text-dark-text-secondary text-sm">
                Select repositories to work with (infrastructure repos are always included)
              </p>
            </div>

            <div className="space-y-2 max-h-96 overflow-y-auto">
              {workspace.selectableRepos.map((repo) => (
                <label
                  key={repo.name}
                  className="flex items-start gap-3 p-3 rounded-lg border border-light-border dark:border-dark-border hover:bg-light-surface dark:hover:bg-dark-surface cursor-pointer transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={selectedRepos.includes(repo.name)}
                    onChange={() => handleRepoToggle(repo.name)}
                    className="mt-1 w-4 h-4 rounded border-light-border dark:border-dark-border text-light-accent dark:text-dark-accent focus:ring-light-accent dark:focus:ring-dark-accent"
                  />
                  <div className="flex-1">
                    <div className="font-medium text-light-text-primary dark:text-dark-text-primary">
                      {getRepoLabel(repo.name)}
                    </div>
                    {repo.description && (
                      <div className="text-sm text-light-text-secondary dark:text-dark-text-secondary mt-1">
                        {repo.description}
                      </div>
                    )}
                  </div>
                </label>
              ))}

              <label
                className="flex items-start gap-3 p-3 rounded-lg border-2 border-light-accent dark:border-dark-accent hover:bg-light-surface dark:hover:bg-dark-surface cursor-pointer transition-colors"
              >
                <input
                  type="checkbox"
                  checked={isUnsure}
                  onChange={() => handleRepoToggle('unsure')}
                  className="mt-1 w-4 h-4 rounded border-light-border dark:border-dark-border text-light-accent dark:text-dark-accent focus:ring-light-accent dark:focus:ring-dark-accent"
                />
                <div className="flex-1">
                  <div className="font-medium text-light-text-primary dark:text-dark-text-primary">
                    I'm not sure
                  </div>
                  <div className="text-sm text-light-text-secondary dark:text-dark-text-secondary mt-1">
                    Let Claude determine which repositories are needed
                  </div>
                </div>
              </label>
            </div>

            <button
              onClick={handleContinue}
              disabled={!canContinue || workspace.isSettingUp}
              className="w-full px-6 py-3 rounded-lg bg-light-accent dark:bg-dark-accent text-white font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {workspace.isSettingUp ? 'Setting up...' : 'Continue'}
            </button>

            {workspace.error && (
              <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                <p className="text-sm text-red-600 dark:text-red-400">{workspace.error}</p>
              </div>
            )}
          </div>
        )}

        {/* Step 4: Workspace Setup Progress */}
        {currentStep === 'setup' && workspace.progress && (
          <div className="space-y-4">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold text-light-text-primary dark:text-dark-text-primary mb-2">
                Setting up workspace...
              </h2>
              <p className="text-light-text-secondary dark:text-dark-text-secondary text-sm">
                Cloning and updating repositories
              </p>
            </div>

            <div className="space-y-2">
              {workspace.progress.repos.map((repo) => (
                <div
                  key={repo.name}
                  className="flex items-center gap-3 p-3 rounded-lg border border-light-border dark:border-dark-border"
                >
                  <div className="w-5 h-5 flex items-center justify-center">
                    {repo.status === 'done' && (
                      <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                    {repo.status === 'cloning' || repo.status === 'updating' ? (
                      <div className="w-5 h-5 border-2 border-light-accent dark:border-dark-accent border-t-transparent rounded-full animate-spin" />
                    ) : repo.status === 'error' ? (
                      <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    ) : (
                      <div className="w-5 h-5 rounded-full border-2 border-light-border dark:border-dark-border" />
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-light-text-primary dark:text-dark-text-primary">
                      {getRepoLabel(repo.name)}
                    </div>
                    {repo.error && (
                      <div className="text-sm text-red-600 dark:text-red-400 mt-1">{repo.error}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="w-full bg-light-surface dark:bg-dark-surface rounded-full h-2 overflow-hidden">
              <div
                className="bg-light-accent dark:bg-dark-accent h-full transition-all duration-300"
                style={{
                  width: `${(workspace.progress.completed / workspace.progress.total) * 100}%`,
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
