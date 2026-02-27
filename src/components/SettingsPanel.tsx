import { useState, useEffect } from 'react'

interface SettingsPanelProps {
	isOpen: boolean
	onClose: () => void
}

export function SettingsPanel({ isOpen, onClose }: SettingsPanelProps) {
	const [serverUrl, setServerUrl] = useState('')
	const [serverToken, setServerToken] = useState('')
	const [isSaving, setIsSaving] = useState(false)
	const [saved, setSaved] = useState(false)

	// Load current server config on open
	useEffect(() => {
		if (isOpen && window.electronAPI?.openclaw) {
			window.electronAPI.openclaw.getServer().then((config) => {
				setServerUrl(config.url)
				setServerToken(config.token)
			})
		}
	}, [isOpen])

	const handleSave = async () => {
		if (!window.electronAPI?.openclaw) return
		setIsSaving(true)
		await window.electronAPI.openclaw.setServer(serverUrl, serverToken)
		setIsSaving(false)
		setSaved(true)
		setTimeout(() => setSaved(false), 2000)
	}

	if (!isOpen) return null

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center">
			{/* Backdrop */}
			<div className="absolute inset-0 bg-black/40" onClick={onClose} />

			{/* Panel */}
			<div className="relative w-full max-w-md mx-4 bg-light-bg dark:bg-dark-bg rounded-xl border border-light-border dark:border-dark-border shadow-xl">
				{/* Header */}
				<div className="flex items-center justify-between px-5 py-4 border-b border-light-border dark:border-dark-border">
					<h2 className="text-lg font-semibold text-light-text-primary dark:text-dark-text-primary">
						Settings
					</h2>
					<button
						onClick={onClose}
						className="p-1 rounded-lg hover:bg-light-surface dark:hover:bg-dark-surface transition-colors"
					>
						<svg className="w-5 h-5 text-light-text-secondary dark:text-dark-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
						</svg>
					</button>
				</div>

				{/* Body */}
				<div className="px-5 py-4 space-y-4">
					<div className="text-xs font-semibold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary">
						OpenClaw Server
					</div>

					<div>
						<label className="block text-sm font-medium text-light-text-primary dark:text-dark-text-primary mb-1">
							Server URL
						</label>
						<input
							type="url"
							value={serverUrl}
							onChange={(e) => setServerUrl(e.target.value)}
							placeholder="http://localhost:18789"
							className="w-full px-3 py-2 text-sm bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border rounded-lg text-light-text-primary dark:text-dark-text-primary placeholder-light-text-secondary dark:placeholder-dark-text-secondary focus:outline-none focus:border-light-accent dark:focus:border-dark-accent"
						/>
					</div>

					<div>
						<label className="block text-sm font-medium text-light-text-primary dark:text-dark-text-primary mb-1">
							Bearer Token
						</label>
						<input
							type="password"
							value={serverToken}
							onChange={(e) => setServerToken(e.target.value)}
							placeholder="swanson-dev-token"
							className="w-full px-3 py-2 text-sm bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border rounded-lg text-light-text-primary dark:text-dark-text-primary placeholder-light-text-secondary dark:placeholder-dark-text-secondary focus:outline-none focus:border-light-accent dark:focus:border-dark-accent"
						/>
					</div>
				</div>

				{/* Footer */}
				<div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-light-border dark:border-dark-border">
					{saved && (
						<span className="text-xs text-green-600 dark:text-green-400">Saved</span>
					)}
					<button
						onClick={onClose}
						className="px-4 py-2 text-sm rounded-lg border border-light-border dark:border-dark-border text-light-text-secondary dark:text-dark-text-secondary hover:bg-light-surface dark:hover:bg-dark-surface transition-colors"
					>
						Cancel
					</button>
					<button
						onClick={handleSave}
						disabled={isSaving}
						className="px-4 py-2 text-sm rounded-lg bg-light-accent dark:bg-dark-accent text-white hover:opacity-90 disabled:opacity-50 transition-colors"
					>
						{isSaving ? "Saving..." : "Save"}
					</button>
				</div>
			</div>
		</div>
	)
}
