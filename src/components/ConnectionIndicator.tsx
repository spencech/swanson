interface ConnectionIndicatorProps {
	state: 'connected' | 'disconnected' | 'reconnecting'
}

const STATE_CONFIG = {
	connected: { color: 'bg-green-500', label: 'Connected' },
	disconnected: { color: 'bg-red-500', label: 'Disconnected' },
	reconnecting: { color: 'bg-yellow-500 animate-pulse', label: 'Reconnecting' },
}

export function ConnectionIndicator({ state }: ConnectionIndicatorProps) {
	const config = STATE_CONFIG[state]

	return (
		<div className="flex items-center gap-1.5 no-drag" title={`Server: ${config.label}`}>
			<div className={`w-2 h-2 rounded-full ${config.color}`} />
			<span className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
				{config.label}
			</span>
		</div>
	)
}
