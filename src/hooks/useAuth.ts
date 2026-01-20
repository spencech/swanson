import { useState, useEffect, useCallback } from 'react'
import { useGitHub, GitHubUser } from './useGitHub'

interface User {
  email: string
  name: string
}

interface AuthState {
  isAuthenticated: boolean // Requires BOTH Google AND GitHub
  isGoogleConnected: boolean
  isGitHubConnected: boolean
  isLoading: boolean
  user: User | null
  githubUser: GitHubUser | null
  error: string | null
}

export function useAuth() {
  const github = useGitHub()
  const [googleState, setGoogleState] = useState<{
    isConnected: boolean
    isLoading: boolean
    user: User | null
    error: string | null
  }>({
    isConnected: false,
    isLoading: true,
    user: null,
    error: null,
  })

  // Combined state
  const state: AuthState = {
    isAuthenticated: googleState.isConnected && github.isConnected,
    isGoogleConnected: googleState.isConnected,
    isGitHubConnected: github.isConnected,
    isLoading: googleState.isLoading || github.isLoading,
    user: googleState.user,
    githubUser: github.user,
    error: googleState.error || github.error,
  }
  
  // Log auth state changes
  useEffect(() => {
    console.log('useAuth: State changed', {
      isAuthenticated: state.isAuthenticated,
      isGoogleConnected: state.isGoogleConnected,
      isGitHubConnected: state.isGitHubConnected,
      isLoading: state.isLoading,
      hasUser: !!state.user,
      hasGitHubUser: !!state.githubUser,
    })
  }, [state.isAuthenticated, state.isGoogleConnected, state.isGitHubConnected, state.isLoading, state.user, state.githubUser])

  // Check initial Google auth state
  useEffect(() => {
    const checkAuth = async () => {
      if (!window.electronAPI?.auth) {
        setGoogleState({
          isConnected: false,
          isLoading: false,
          user: null,
          error: 'Electron API not available. Preload script may have failed to load.',
        })
        return
      }

      try {
        const authState = await window.electronAPI.auth.getState()
        setGoogleState({
          isConnected: authState.isAuthenticated,
          isLoading: false,
          user: authState.user || null,
          error: null,
        })
      } catch (error) {
        setGoogleState({
          isConnected: false,
          isLoading: false,
          user: null,
          error: (error as Error).message,
        })
      }
    }

    checkAuth()

    // Listen for Google auth success events
    if (window.electronAPI?.auth) {
      window.electronAPI.auth.onAuthSuccess((user) => {
        setGoogleState({
          isConnected: true,
          isLoading: false,
          user,
          error: null,
        })
      })
    }
  }, [])

  const login = useCallback(async () => {
    if (!window.electronAPI?.auth) {
      setGoogleState((prev) => ({
        ...prev,
        error: 'Electron API not available',
      }))
      return
    }

    setGoogleState((prev) => ({ ...prev, isLoading: true, error: null }))

    try {
      const result = await window.electronAPI.auth.login()

      if (result.success) {
        setGoogleState({
          isConnected: true,
          isLoading: false,
          user: result.user || null,
          error: null,
        })
      } else {
        setGoogleState((prev) => ({
          ...prev,
          isLoading: false,
          error: result.error || 'Login failed',
        }))
      }
    } catch (error) {
      setGoogleState((prev) => ({
        ...prev,
        isLoading: false,
        error: (error as Error).message,
      }))
    }
  }, [])

  const logout = useCallback(async () => {
    if (window.electronAPI?.auth) {
      try {
        await window.electronAPI.auth.logout()
      } catch (error) {
        // Ignore errors
      }
    }

    if (window.electronAPI?.github) {
      try {
        await window.electronAPI.github.logout()
      } catch (error) {
        // Ignore errors
      }
    }

    // Reset Google state
    setGoogleState({
      isConnected: false,
      isLoading: false,
      user: null,
      error: null,
    })
    
    // Reset GitHub state via the hook
    github.disconnect()
  }, [github])

  return {
    ...state,
    login,
    logout,
    github,
  }
}
