import { useState } from 'react'
import { useThreads } from '../hooks/useThreads'
import { ThreadModeModal } from './ThreadModeModal'
import type { PlanStatus, ThreadMode } from '../../shared/types'

const STATUS_COLORS: Record<PlanStatus, string> = {
	draft: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
	refined: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
	approved: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
	exported: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
}

export function Dashboard() {
	const { plans, createThread } = useThreads()
	const [showModeModal, setShowModeModal] = useState(false)

	const handleModeSelect = (mode: ThreadMode) => {
		setShowModeModal(false)
		createThread(mode)
	}

	const planCounts = {
		draft: plans.filter((p) => p.status === "draft").length,
		approved: plans.filter((p) => p.status === "approved").length,
		total: plans.length,
	}

	return (
		<div className="flex-1 flex items-center justify-center">
			<div className="text-center max-w-lg px-4">
				<h2 className="text-2xl font-semibold text-light-text-primary dark:text-dark-text-primary mb-3">
					How can Swanson help?
				</h2>
				<p className="text-light-text-secondary dark:text-dark-text-secondary mb-6">
					Ask a question about the codebase or start a work order to plan a feature.
				</p>

				<button
					onClick={() => setShowModeModal(true)}
					className="px-6 py-3 bg-light-accent dark:bg-dark-accent text-white rounded-xl font-medium hover:opacity-90 transition-opacity"
				>
					New Thread
				</button>

				{showModeModal && (
					<ThreadModeModal
						onSelect={handleModeSelect}
						onClose={() => setShowModeModal(false)}
					/>
				)}

				{/* Plan summary cards */}
				{plans.length > 0 && (
					<div className="mt-8 grid grid-cols-3 gap-3 text-left">
						<div className="p-3 rounded-lg bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border">
							<div className="text-2xl font-bold text-light-text-primary dark:text-dark-text-primary">
								{planCounts.total}
							</div>
							<div className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
								Total Plans
							</div>
						</div>
						<div className="p-3 rounded-lg bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border">
							<div className="text-2xl font-bold text-light-text-primary dark:text-dark-text-primary">
								{planCounts.draft}
							</div>
							<div className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
								In Progress
							</div>
						</div>
						<div className="p-3 rounded-lg bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border">
							<div className="text-2xl font-bold text-light-text-primary dark:text-dark-text-primary">
								{planCounts.approved}
							</div>
							<div className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
								Approved
							</div>
						</div>
					</div>
				)}

				{/* Recent plans list */}
				{plans.length > 0 && (
					<div className="mt-4 text-left">
						<div className="text-xs font-semibold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary mb-2">
							Recent Plans
						</div>
						<div className="space-y-1.5">
							{plans.slice(0, 5).map((plan) => (
								<div
									key={plan.id}
									className="flex items-center gap-2 p-2 rounded-lg bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border"
								>
									<span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[plan.status]}`}>
										{plan.status}
									</span>
									<span className="text-sm text-light-text-primary dark:text-dark-text-primary truncate">
										{plan.title}
									</span>
									<span className="ml-auto text-xs text-light-text-secondary dark:text-dark-text-secondary shrink-0">
										{plan.stepCount} steps
									</span>
								</div>
							))}
						</div>
					</div>
				)}
			</div>
		</div>
	)
}
