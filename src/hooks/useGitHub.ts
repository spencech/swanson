import { useState, useEffect, useCallback, useRef } from 'react'

export interface GitHubUser {
  login: string
  name: string
  avatarUrl: string
}

interface GitHubState {
  isConnected: boolean
  isLoading: boolean
  user: GitHubUser | null
  error: string | null
}

export function useGitHub() {
  const [state, setState] = useState<GitHubState>({
    isConnected: false,
    isLoading: true, // Start as loading to check initial state
    user: null,
    error: null,
  })
  
  const isPollingRef = useRef(false) // Track if we're actively polling
  
  // Log state changes
  useEffect(() => {
    console.log('useGitHub: State changed', {
      isConnected: state.isConnected,
      isLoading: state.isLoading,
      hasUser: !!state.user,
      userLogin: state.user?.login,
      error: state.error,
    })
  }, [state.isConnected, state.isLoading, state.user, state.error])

  // Check initial connection state
  useEffect(() => {
    const checkGitHub = async () => {
      if (!window.electronAPI?.github) {
        setState({
          isConnected: false,
          isLoading: false,
          user: null,
          error: 'Electron API not available',
        })
        return
      }

      try {
        const githubState = await window.electronAPI.github.getState()
        // Always set isLoading to false after initial check (unless actively polling)
        setState((prev) => {
          // Don't update state if we're actively polling - preserve polling state
          if (isPollingRef.current && prev.isLoading) {
            return prev
          }
          // Don't update if we just disconnected (state was reset)
          if (!prev.isLoading && !prev.isConnected && !prev.user && !prev.error) {
            return prev
          }
          return {
            isConnected: githubState.isConnected,
            isLoading: false, // Initial check complete
            user: githubState.user,
            error: null, // Clear any previous errors
          }
        })
      } catch (error) {
        // Don't set error on initial check failure - might just be not connected yet
        // Always set isLoading to false after initial check (unless actively polling)
        setState((prev) => {
          // Don't update state if we're actively polling - preserve polling state
          if (isPollingRef.current && prev.isLoading) {
            return prev
          }
          // Don't update if we just disconnected (state was reset)
          if (!prev.isLoading && !prev.isConnected && !prev.user && !prev.error) {
            return prev
          }
          return {
            isConnected: false,
            isLoading: false, // Initial check complete
            user: null,
            error: null, // Don't show error on initial check
          }
        })
      }
    }

    checkGitHub()

    // Listen for auth success events
    if (window.electronAPI?.github) {
      window.electronAPI.github.onAuthSuccess((user) => {
        setState({
          isConnected: true,
          isLoading: false,
          user,
          error: null,
        })
      })
    }
  }, [])

  const connect = useCallback(async () => {
    if (!window.electronAPI?.github) {
      setState((prev) => ({
        ...prev,
        error: 'Electron API not available',
      }))
      return
    }

    isPollingRef.current = false // Not polling yet, just starting
    setState((prev) => ({ ...prev, isLoading: true, error: null }))

    try {
      // Start device flow
      const startResult = await window.electronAPI.github.startAuth()
      if (!startResult.success) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: startResult.error || 'Failed to start GitHub authentication',
        }))
        return
      }

      // Return device code info for UI display
      return {
        userCode: startResult.userCode!,
        verificationUri: startResult.verificationUri!,
      }
    } catch (error) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: (error as Error).message,
      }))
      throw error
    }
  }, [])

  const pollToken = useCallback(async () => {
    if (!window.electronAPI?.github) {
      isPollingRef.current = false
      throw new Error('Electron API not available')
    }

    isPollingRef.current = true // Mark that we're actively polling

    try {
      const result = await window.electronAPI.github.pollToken()
      console.log('useGitHub.pollToken: Received result', { 
        success: result.success, 
        hasUser: !!result.user, 
        pending: result.pending,
        error: result.error,
        recommendedInterval: result.recommendedInterval,
      })
      if (result.success && result.user) {
        console.log('useGitHub.pollToken: Success! Setting connected state', { user: result.user })
        console.log('useGitHub.pollToken: Current state before update', {
          isConnected: state.isConnected,
          isLoading: state.isLoading,
          hasUser: !!state.user,
        })
        isPollingRef.current = false // Done polling
        const newState = {
          isConnected: true,
          isLoading: false,
          user: result.user,
          error: null,
        }
        console.log('useGitHub.pollToken: Calling setState with', newState)
        setState(newState)
        console.log('useGitHub.pollToken: setState called, state should update')
        
        // Verify state update after a brief delay
        setTimeout(() => {
          console.log('useGitHub.pollToken: State after update (delayed check)', {
            isConnected: state.isConnected,
            isLoading: state.isLoading,
            hasUser: !!state.user,
          })
        }, 100)
        
        return result.user
      } else if (result.pending) {
        // Still waiting for user authorization - return null to indicate pending
        // Keep isLoading true since we're polling
        setState((prev) => ({
          ...prev,
          isLoading: true, // Keep loading while polling
        }))
        return null
      } else {
        // Only set error if it's not a pending state
        if (result.error && !result.error.includes('pending')) {
          isPollingRef.current = false
          setState({
            isConnected: false,
            isLoading: false,
            error: result.error || null,
            user: null,
          })
          // Throw only for real errors
          throw new Error(result.error || 'Failed to authenticate')
        }
        // If error includes pending or no error, treat as pending
        setState((prev) => ({
          ...prev,
          isLoading: true, // Keep loading while polling
        }))
        return null
      }
    } catch (error) {
      const errorMessage = (error as Error).message
      // Don't set error state for pending/slow_down/GitHub not connected - these are expected during polling
      if (
        errorMessage.includes('AUTHORIZATION_PENDING') ||
        errorMessage.includes('SLOW_DOWN') ||
        errorMessage.includes('pending') ||
        errorMessage.includes('GitHub not connected') // This can happen if getState is called during polling
      ) {
        // Return null to continue polling, keep loading state, clear any error
        setState((prev) => ({
          ...prev,
          isLoading: true, // Keep loading while polling
          error: null, // Clear error for pending states
        }))
        return null
      }
      // Only set error state and throw for real errors
      isPollingRef.current = false
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: errorMessage,
      }))
      throw error
    }
  }, [])

  const disconnect = useCallback(async () => {
    // Reset state immediately (optimistic update)
    setState({
      isConnected: false,
      isLoading: false,
      user: null,
      error: null,
    })
    
    if (!window.electronAPI?.github) {
      return
    }

    try {
      await window.electronAPI.github.logout()
      // State already reset above
    } catch (error) {
      // Even if logout fails, we've already reset the state
      console.error('GitHub logout error:', error)
    }
  }, [])

  return {
    ...state,
    connect,
    pollToken,
    disconnect,
  }
}
