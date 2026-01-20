import { useState, useEffect, useRef } from 'react'
import { useGitHub } from '../hooks/useGitHub'

interface LoginScreenProps {
  onLogin: () => Promise<void>
  isLoading: boolean
  error: string | null
  isGoogleConnected: boolean
}

export function LoginScreen({
  onLogin,
  isLoading,
  error,
  isGoogleConnected,
}: LoginScreenProps) {
  const github = useGitHub()
  const [deviceCode, setDeviceCode] = useState<string | null>(null)
  const [verificationUri, setVerificationUri] = useState<string | null>(null)
  const [isPolling, setIsPolling] = useState(false)
  const [pollError, setPollError] = useState<string | null>(null)
  const hasStartedFlow = useRef(false)

  // Format user code for display (XXXX-XXXX)
  // GitHub user codes are typically 8 characters, format as XXXX-XXXX
  const formatUserCode = (code: string) => {
    if (!code) return ''
    // Remove any existing dashes/spaces
    const cleanCode = code.replace(/[-\s]/g, '')
    // Format as XXXX-XXXX (split at 4 characters)
    if (cleanCode.length >= 8) {
      return `${cleanCode.slice(0, 4)}-${cleanCode.slice(4, 8)}`
    }
    // If not 8 chars, just add dash in middle
    const mid = Math.floor(cleanCode.length / 2)
    return `${cleanCode.slice(0, mid)}-${cleanCode.slice(mid)}`
  }

  // Polling logic - runs when deviceCode is set and polling is active
  useEffect(() => {
    if (!deviceCode || !isPolling) return

    let pollInterval: NodeJS.Timeout | null = null
    let timeoutId: NodeJS.Timeout | null = null
    let isCleanedUp = false

    // Wait a few seconds before first poll to give user time to see the code and open GitHub
    const startPolling = async () => {
      await new Promise((resolve) => setTimeout(resolve, 5000)) // Increased to 5 seconds

      if (isCleanedUp) return

      // Start polling for token
      const doPoll = async () => {
        if (isCleanedUp) {
          console.log('Poll: Already cleaned up, skipping')
          return
        }

        console.log('Poll: Starting poll attempt at', new Date().toISOString())

        try {
          const result = await window.electronAPI?.github?.pollToken()
          if (!result) {
            console.log('Poll: No result from pollToken')
            return
          }
          
          console.log('Poll: pollToken result', { 
            success: result.success, 
            pending: result.pending,
            hasUser: !!result.user,
            recommendedInterval: result.recommendedInterval 
          })
          
          // Update polling interval if recommended
          if (result.recommendedInterval && result.recommendedInterval !== currentPollInterval / 1000) {
            console.log('Poll: Updating interval', { 
              old: currentPollInterval / 1000, 
              new: result.recommendedInterval 
            })
            currentPollInterval = result.recommendedInterval * 1000
            scheduleNextPoll()
          }
          
          if (result.success && result.user) {
            // Success - token received and user info available
            console.log('Poll: Success! User authenticated:', result.user.login)
            console.log('Poll: Current github.isConnected:', github.isConnected)
            if (pollInterval) {
              clearInterval(pollInterval)
              pollInterval = null
            }
            setIsPolling(false)
            // Force a small delay to let state update propagate
            await new Promise(resolve => setTimeout(resolve, 100))
            console.log('Poll: After delay, github.isConnected:', github.isConnected)
            return
          }
          // If pending, continue polling
          console.log('Poll: Still pending, will continue...')
        } catch (err) {
          // Only catch real errors (not pending states)
          const errorMessage = (err as Error).message
          console.log('Poll: Caught error:', errorMessage)
          
          // Check if this is a pending/slow_down error - these should have been handled by pollToken
          // But if they somehow got through, ignore them
          if (
            errorMessage.includes('AUTHORIZATION_PENDING') ||
            errorMessage.includes('SLOW_DOWN') ||
            errorMessage.includes('pending') ||
            errorMessage.includes('GitHub not connected') // This might happen if getState is called during polling
          ) {
            // Continue polling - don't stop
            console.log('Poll: Pending state detected, continuing...')
            return
          }
          
          // Stop polling for real errors only
          console.error('Poll: Real error detected, stopping:', errorMessage)
          if (pollInterval) {
            clearInterval(pollInterval)
            pollInterval = null
          }
          setIsPolling(false)
          setPollError(errorMessage)
        }
      }

      // Do first poll immediately after delay
      doPoll()

      // Poll with dynamic interval - start with 5 seconds, will be adjusted by backend
      let currentPollInterval = 5000
      const scheduleNextPoll = () => {
        if (pollInterval) {
          clearInterval(pollInterval)
        }
        pollInterval = setInterval(() => {
          doPoll()
          // After each poll, check if we need to update the interval
          // The backend will update deviceCodeInterval in the store when slow_down occurs
          // We'll check it on the next poll cycle
        }, currentPollInterval)
      }
      scheduleNextPoll()
      
      // Note: The backend handles slow_down internally and updates deviceCodeInterval in the store
      // We'll continue polling and let the backend handle rate limiting via error responses

      // Cleanup interval after 15 minutes (device codes expire after 15 minutes)
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

    // Cleanup function
    return () => {
      console.log('Poll: useEffect cleanup called - stopping polling')
      isCleanedUp = true
      if (pollInterval) {
        clearInterval(pollInterval)
        pollInterval = null
      }
      // Note: intervalCheck will be cleaned up by isCleanedUp check
      if (timeoutId) {
        clearTimeout(timeoutId)
        timeoutId = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceCode, isPolling])

  // Reset flag when GitHub connects or Google disconnects
  useEffect(() => {
    console.log('LoginScreen: github.isConnected changed', {
      isConnected: github.isConnected,
      isGoogleConnected,
      hasUser: !!github.user,
    })
    if (github.isConnected) {
      console.log('LoginScreen: GitHub connected! Resetting state')
      // GitHub connected - reset everything
      hasStartedFlow.current = false
      setDeviceCode(null)
      setVerificationUri(null)
      setIsPolling(false)
      setPollError(null)
    } else if (!isGoogleConnected) {
      // Google disconnected - reset everything
      hasStartedFlow.current = false
      setDeviceCode(null)
      setVerificationUri(null)
      setIsPolling(false)
      setPollError(null)
    }
    // Don't reset if Google is connected but GitHub isn't - that's the normal state during auth
    // Also don't reset if we're actively polling - let the polling complete
  }, [github.isConnected, isGoogleConnected, github.user])

  const handleStartGitHubAuth = async () => {
    if (hasStartedFlow.current || isPolling) return // Prevent multiple starts

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
      hasStartedFlow.current = false // Reset on error so user can retry
    }
  }

  const handleOpenGitHub = async () => {
    if (verificationUri) {
      // Open the verification URL in browser
      if (window.electronAPI?.github) {
        // Use electron shell to open external browser
        await window.electronAPI.github.openVerificationUri(verificationUri)
      } else {
        // Fallback to window.open
        window.open(verificationUri, '_blank')
      }
    }
  }

  return (
    <div className="flex-1 flex items-center justify-center bg-light-bg dark:bg-dark-bg">
      <div className="w-full max-w-md px-8">
        {/* Logo / Title */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-light-text-primary dark:text-dark-text-primary mb-2">
            Swanson
          </h1>
          <p className="text-light-text-secondary dark:text-dark-text-secondary">
            Generate spawnee plans through conversation
          </p>
        </div>

        {/* Step 1: Google SSO */}
        {!isGoogleConnected && (
          <div className="space-y-4">
            <div className="text-sm text-light-text-secondary dark:text-dark-text-secondary mb-4">
              Step 1 of 2: Sign in with Google
            </div>
        <button
          onClick={onLogin}
          disabled={isLoading}
          className="w-full flex items-center justify-center gap-3 px-6 py-3 rounded-lg bg-white dark:bg-dark-surface border border-light-border dark:border-dark-border hover:bg-light-surface dark:hover:bg-dark-border transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? (
            <>
              <div className="w-5 h-5 border-2 border-light-text-secondary border-t-transparent rounded-full animate-spin" />
              <span className="text-light-text-primary dark:text-dark-text-primary">
                Signing in...
              </span>
            </>
          ) : (
            <>
              {/* Google Icon */}
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
          </div>
        )}

        {/* Step 2: GitHub Device Flow */}
        {isGoogleConnected && !github.isConnected && (
          <div className="space-y-4">
            <div className="text-sm text-light-text-secondary dark:text-dark-text-secondary mb-4">
              Step 2 of 2: Connect GitHub
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
                    <span className="text-light-text-primary dark:text-dark-text-primary">
                      Connecting...
                    </span>
                  </>
                ) : (
                  <>
                    {/* GitHub Icon */}
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
                  {/* GitHub Icon */}
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

                {github.isConnected && (
                  <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                    <p className="text-sm text-green-600 dark:text-green-400 text-center">
                      ✓ GitHub connected successfully!
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Error Messages */}
        {(error || pollError || (github.error && !github.error.includes('pending') && !github.error.includes('GitHub not connected'))) && (
          <div className="mt-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
            <p className="text-sm text-red-600 dark:text-red-400">
              {error || pollError || github.error}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
