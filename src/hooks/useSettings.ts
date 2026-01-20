import { useState, useEffect, useCallback } from 'react'

interface Settings {
  theme: 'light' | 'dark'
  jiraEmail?: string
  jiraApiToken?: string
}

const DEFAULT_SETTINGS: Settings = {
  theme: 'light',
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const loadSettings = async () => {
      // Check if electronAPI is available
      if (!window.electronAPI?.settings) {
        console.warn('Electron settings API not available, using defaults')
        setSettings(DEFAULT_SETTINGS)
        setIsLoading(false)
        return
      }

      try {
        const loaded = (await window.electronAPI.settings.get()) as Settings
        setSettings(loaded || DEFAULT_SETTINGS)
      } catch (error) {
        console.error('Failed to load settings:', error)
        setSettings(DEFAULT_SETTINGS)
      } finally {
        setIsLoading(false)
      }
    }

    loadSettings()
  }, [])

  const updateSetting = useCallback(async <K extends keyof Settings>(
    key: K,
    value: Settings[K]
  ) => {
    // Update local state immediately
    setSettings((prev) => (prev ? { ...prev, [key]: value } : { ...DEFAULT_SETTINGS, [key]: value }))

    // Try to persist to electron store
    if (window.electronAPI?.settings) {
      try {
        await window.electronAPI.settings.set(key, value)
      } catch (error) {
        console.error('Failed to update setting:', error)
        throw error
      }
    }
  }, [])

  return {
    settings,
    isLoading,
    updateSetting,
  }
}
