import { useState, useEffect, useCallback } from 'react'

interface User {
  email: string
  name: string
}

interface AuthState {
  isAuthenticated: boolean
  isLoading: boolean
  user: User | null
  error: string | null
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    isAuthenticated: false,
    isLoading: true,
    user: null,
    error: null,
  })

  // Check initial auth state
  useEffect(() => {
    const checkAuth = async () => {
      // Check if electronAPI is available
      if (!window.electronAPI?.auth) {
        setState({
          isAuthenticated: false,
          isLoading: false,
          user: null,
          error: 'Electron API not available. Preload script may have failed to load.',
        })
        return
      }

      try {
        const authState = await window.electronAPI.auth.getState()
        setState({
          isAuthenticated: authState.isAuthenticated,
          isLoading: false,
          user: authState.user || null,
          error: null,
        })
      } catch (error) {
        setState({
          isAuthenticated: false,
          isLoading: false,
          user: null,
          error: (error as Error).message,
        })
      }
    }

    checkAuth()

    // Listen for auth success events (only if API is available)
    if (window.electronAPI?.auth) {
      window.electronAPI.auth.onAuthSuccess((user) => {
        setState({
          isAuthenticated: true,
          isLoading: false,
          user,
          error: null,
        })
      })
    }
  }, [])

  const login = useCallback(async () => {
    if (!window.electronAPI?.auth) {
      setState((prev) => ({
        ...prev,
        error: 'Electron API not available',
      }))
      return
    }

    setState((prev) => ({ ...prev, isLoading: true, error: null }))

    try {
      const result = await window.electronAPI.auth.login()

      if (result.success) {
        setState({
          isAuthenticated: true,
          isLoading: false,
          user: result.user || null,
          error: null,
        })
      } else {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: result.error || 'Login failed',
        }))
      }
    } catch (error) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: (error as Error).message,
      }))
    }
  }, [])

  const logout = useCallback(async () => {
    if (!window.electronAPI?.auth) {
      return
    }

    try {
      await window.electronAPI.auth.logout()
      setState({
        isAuthenticated: false,
        isLoading: false,
        user: null,
        error: null,
      })
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: (error as Error).message,
      }))
    }
  }, [])

  return {
    ...state,
    login,
    logout,
  }
}
