import type { ThreadMode } from '../../shared/types'

interface ThreadModeModalProps {
	onSelect: (mode: ThreadMode) => void
	onClose: () => void
}

export function ThreadModeModal({ onSelect, onClose }: ThreadModeModalProps) {
	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
			onClick={onClose}
		>
			<div
				className="bg-light-bg dark:bg-dark-bg rounded-2xl shadow-2xl p-6 w-[560px] max-w-[90vw]"
				onClick={(e) => e.stopPropagation()}
			>
				<h2 className="text-lg font-semibold text-light-text-primary dark:text-dark-text-primary mb-1">
					Start a new thread
				</h2>
				<p className="text-sm text-light-text-secondary dark:text-dark-text-secondary mb-5">
					What would you like to do?
				</p>

				<div className="grid grid-cols-3 gap-3">
					{/* Question mode */}
					<button
						onClick={() => onSelect("question")}
						className="flex flex-col items-center gap-3 p-5 rounded-xl border-2 border-light-border dark:border-dark-border hover:border-light-accent dark:hover:border-dark-accent bg-light-surface dark:bg-dark-surface transition-colors text-left"
					>
						<svg className="w-8 h-8 text-light-accent dark:text-dark-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
						</svg>
						<div>
							<div className="font-medium text-sm text-light-text-primary dark:text-dark-text-primary">
								Question
							</div>
							<div className="text-xs text-light-text-secondary dark:text-dark-text-secondary mt-1">
								Ask about the codebase, architecture, or conventions
							</div>
						</div>
					</button>

					{/* Work Order mode */}
					<button
						onClick={() => onSelect("work_order")}
						className="flex flex-col items-center gap-3 p-5 rounded-xl border-2 border-light-border dark:border-dark-border hover:border-light-accent dark:hover:border-dark-accent bg-light-surface dark:bg-dark-surface transition-colors text-left"
					>
						<svg className="w-8 h-8 text-light-accent dark:text-dark-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15a2.25 2.25 0 012.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
						</svg>
						<div>
							<div className="font-medium text-sm text-light-text-primary dark:text-dark-text-primary">
								Work Order
							</div>
							<div className="text-xs text-light-text-secondary dark:text-dark-text-secondary mt-1">
								Plan a feature and generate a spawnee template
							</div>
						</div>
					</button>

					{/* Artifact mode */}
					<button
						onClick={() => onSelect("artifact")}
						className="flex flex-col items-center gap-3 p-5 rounded-xl border-2 border-light-border dark:border-dark-border hover:border-light-accent dark:hover:border-dark-accent bg-light-surface dark:bg-dark-surface transition-colors text-left"
					>
						<svg className="w-8 h-8 text-light-accent dark:text-dark-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
						</svg>
						<div>
							<div className="font-medium text-sm text-light-text-primary dark:text-dark-text-primary">
								Artifact
							</div>
							<div className="text-xs text-light-text-secondary dark:text-dark-text-secondary mt-1">
								Generate a downloadable document — summary, analysis, or report
							</div>
						</div>
					</button>
				</div>
			</div>
		</div>
	)
}
