import { useState, useEffect, useCallback } from 'react'

interface SelectableRepo {
  name: string
  url: string
  description: string
}

interface WorkspaceProgress {
  total: number
  completed: number
  current: string
  repos: Array<{
    name: string
    status: 'pending' | 'cloning' | 'updating' | 'done' | 'error'
    error?: string
  }>
}

interface WorkspaceConfig {
  checkedOutRepos: Array<{
    name: string
    path: string
    description?: string
  }>
  metadataOnlyRepos: Array<{
    name: string
    description: string
  }>
  isUnsure: boolean
}

interface WorkspaceState {
  isSettingUp: boolean
  progress: WorkspaceProgress | null
  selectableRepos: SelectableRepo[]
  error: string | null
}

export function useWorkspace() {
  const [state, setState] = useState<WorkspaceState>({
    isSettingUp: false,
    progress: null,
    selectableRepos: [],
    error: null,
  })

  // Load selectable repos on mount
  useEffect(() => {
    const loadRepos = async () => {
      if (!window.electronAPI?.workspace) return

      try {
        const result = await window.electronAPI.workspace.getSelectableRepos()
        if (result.success && result.repos) {
          setState((prev) => ({ ...prev, selectableRepos: result.repos || [] }))
        } else {
          setState((prev) => ({ ...prev, error: result.error || 'Failed to load repositories' }))
        }
      } catch (error) {
        setState((prev) => ({ ...prev, error: (error as Error).message }))
      }
    }

    loadRepos()
  }, [])

  // Listen for progress updates
  useEffect(() => {
    if (!window.electronAPI?.workspace) return

    const cleanup = window.electronAPI.workspace.onProgress((progress) => {
      setState((prev) => ({ ...prev, progress }))
    })

    return cleanup
  }, [])

  const setup = useCallback(async (selectedRepos: string[], isUnsure: boolean): Promise<WorkspaceConfig | null> => {
    if (!window.electronAPI?.workspace) {
      setState((prev) => ({ ...prev, error: 'Workspace API not available' }))
      return null
    }

    setState((prev) => ({
      ...prev,
      isSettingUp: true,
      error: null,
      progress: null,
    }))

    try {
      const result = await window.electronAPI.workspace.setup(selectedRepos, isUnsure)
      
      if (result.success && result.config) {
        setState((prev) => ({
          ...prev,
          isSettingUp: false,
          progress: null,
        }))
        return result.config
      } else {
        setState((prev) => ({
          ...prev,
          isSettingUp: false,
          error: result.error || 'Failed to setup workspace',
        }))
        return null
      }
    } catch (error) {
      setState((prev) => ({
        ...prev,
        isSettingUp: false,
        error: (error as Error).message,
      }))
      return null
    }
  }, [])

  return {
    ...state,
    setup,
  }
}
