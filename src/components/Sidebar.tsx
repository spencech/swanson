import { useThreads } from '../hooks/useThreads'
import { useThreadStore } from '../stores/threadStore'
import { SidebarThreadItem } from './SidebarThreadItem'
import { SidebarPlanGroup } from './SidebarPlanGroup'
import type { PlanStatus } from '../../shared/types'

const PLAN_STATUS_ORDER: PlanStatus[] = ["draft", "refined", "approved", "exported"]

export function Sidebar() {
	const {
		threads,
		plans,
		activeThreadId,
		createThread,
		switchThread,
		deleteThread,
		renameThread,
	} = useThreads()
	const sidebarCollapsed = useThreadStore((state) => state.sidebarCollapsed)
	const toggleSidebar = useThreadStore((state) => state.toggleSidebar)

	if (sidebarCollapsed) {
		return (
			<div className="w-12 shrink-0 border-r border-light-border dark:border-dark-border bg-light-surface dark:bg-dark-surface flex flex-col items-center py-3 gap-3">
				<button
					onClick={toggleSidebar}
					className="p-2 rounded-lg hover:bg-light-border dark:hover:bg-dark-border transition-colors"
					title="Expand sidebar"
				>
					<svg className="w-4 h-4 text-light-text-secondary dark:text-dark-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
					</svg>
				</button>
				<button
					onClick={createThread}
					className="p-2 rounded-lg hover:bg-light-border dark:hover:bg-dark-border transition-colors"
					title="New thread"
				>
					<svg className="w-4 h-4 text-light-text-secondary dark:text-dark-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
					</svg>
				</button>
			</div>
		)
	}

	const plansByStatus = PLAN_STATUS_ORDER.reduce((acc, status) => {
		acc[status] = plans.filter((p) => p.status === status)
		return acc
	}, {} as Record<PlanStatus, typeof plans>)

	return (
		<div className="w-72 shrink-0 border-r border-light-border dark:border-dark-border bg-light-surface dark:bg-dark-surface flex flex-col overflow-hidden">
			{/* Header */}
			<div className="flex items-center justify-between px-3 py-3 border-b border-light-border dark:border-dark-border">
				<span className="text-sm font-semibold text-light-text-primary dark:text-dark-text-primary">
					My Work
				</span>
				<div className="flex items-center gap-1">
					<button
						onClick={createThread}
						className="p-1.5 rounded-lg hover:bg-light-border dark:hover:bg-dark-border transition-colors"
						title="New thread"
					>
						<svg className="w-4 h-4 text-light-text-secondary dark:text-dark-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
						</svg>
					</button>
					<button
						onClick={toggleSidebar}
						className="p-1.5 rounded-lg hover:bg-light-border dark:hover:bg-dark-border transition-colors"
						title="Collapse sidebar"
					>
						<svg className="w-4 h-4 text-light-text-secondary dark:text-dark-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
						</svg>
					</button>
				</div>
			</div>

			{/* Scrollable content */}
			<div className="flex-1 overflow-y-auto py-2">
				{/* Plans section */}
				{plans.length > 0 && (
					<div className="mb-3">
						<div className="px-3 py-1 text-xs font-semibold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary">
							Plans
						</div>
						{PLAN_STATUS_ORDER.map((status) => (
							<SidebarPlanGroup
								key={status}
								status={status}
								plans={plansByStatus[status]}
								onPlanClick={() => {
									// Plan click would navigate to the thread or show plan detail
								}}
							/>
						))}
					</div>
				)}

				{/* Threads section */}
				<div>
					<div className="px-3 py-1 text-xs font-semibold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary">
						Threads
					</div>
					{threads.length === 0 ? (
						<div className="px-3 py-4 text-center text-xs text-light-text-secondary dark:text-dark-text-secondary">
							No threads yet
						</div>
					) : (
						<div className="space-y-0.5 mt-1">
							{threads.map((thread) => (
								<SidebarThreadItem
									key={thread.id}
									thread={thread}
									isActive={thread.id === activeThreadId}
									onClick={() => switchThread(thread.id)}
									onDelete={() => deleteThread(thread.id)}
									onRename={(title) => renameThread(thread.id, title)}
								/>
							))}
						</div>
					)}
				</div>
			</div>
		</div>
	)
}
