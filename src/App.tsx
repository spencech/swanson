import { useEffect, useState } from 'react'
import { useAuth } from './hooks/useAuth'
import { useSettings } from './hooks/useSettings'
import { useThreadStore } from './stores/threadStore'
import { LaunchScreen } from './components/LaunchScreen'
import { ChatContainer } from './components/ChatContainer'
import { Sidebar } from './components/Sidebar'
import { Dashboard } from './components/Dashboard'
import { SettingsPanel } from './components/SettingsPanel'
import { ConnectionIndicator } from './components/ConnectionIndicator'

type ConnectionState = 'connected' | 'disconnected' | 'reconnecting'

function App() {
	const [theme, setTheme] = useState<'light' | 'dark'>('light')
	const [appVersion, setAppVersion] = useState<string>('')
	const [ready, setReady] = useState(false)
	const [settingsOpen, setSettingsOpen] = useState(false)
	const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected')

	const { isAuthenticated, isLoading: authLoading, user, logout } = useAuth()
	const { settings, isLoading: settingsLoading, updateSetting } = useSettings()
	const activeThreadId = useThreadStore((state) => state.activeThreadId)

	// Load theme from settings
	useEffect(() => {
		if (settings?.theme) {
			setTheme(settings.theme)
		} else {
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

	// Auto-collapse sidebar on narrow windows
	useEffect(() => {
		const handleResize = () => {
			if (window.innerWidth < 900) {
				useThreadStore.getState().setSidebarCollapsed(true)
			}
		}
		window.addEventListener('resize', handleResize)
		handleResize()
		return () => window.removeEventListener('resize', handleResize)
	}, [])

	// Poll connection state
	useEffect(() => {
		if (!ready || !window.electronAPI?.openclaw) return

		const checkStatus = async () => {
			try {
				const result = await window.electronAPI.openclaw.status()
				setConnectionState(result.state as ConnectionState)
			} catch {
				setConnectionState('disconnected')
			}
		}

		checkStatus()
		const interval = setInterval(checkStatus, 5000)
		return () => clearInterval(interval)
	}, [ready])

	const toggleTheme = async () => {
		const newTheme = theme === 'light' ? 'dark' : 'light'
		setTheme(newTheme)
		await updateSetting('theme', newTheme)
	}

	const isLoading = authLoading || settingsLoading

	return (
		<div className="h-screen flex flex-col bg-light-bg dark:bg-dark-bg text-light-text-primary dark:text-dark-text-primary">
			{/* Title bar / drag region */}
			<div className="drag-region h-12 flex items-center justify-between px-4 border-b border-light-border dark:border-dark-border">
				<div className="flex items-center gap-3 pl-16">
					<span className="font-semibold text-lg">Swanson</span>
					{appVersion && (
						<span className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
							v{appVersion}
						</span>
					)}
					{ready && <ConnectionIndicator state={connectionState} />}
				</div>
				<div className="flex items-center gap-3">
					{isAuthenticated && user && (
						<div className="flex items-center gap-2 no-drag">
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
					{/* Settings button */}
					{ready && (
						<button
							onClick={() => setSettingsOpen(true)}
							className="no-drag p-2 rounded-lg hover:bg-light-surface dark:hover:bg-dark-surface transition-colors"
							aria-label="Settings"
						>
							<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
							</svg>
						</button>
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
			) : !ready ? (
				<LaunchScreen onReady={() => setReady(true)} />
			) : (
				<div className="flex-1 flex overflow-hidden">
					<Sidebar />
					{activeThreadId ? <ChatContainer /> : <Dashboard />}
				</div>
			)}

			{/* Settings modal */}
			<SettingsPanel isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
		</div>
	)
}

export default App
