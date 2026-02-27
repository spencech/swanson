import { useState } from 'react'
import type { IPlanSummary, PlanStatus } from '../../shared/types'

interface SidebarPlanGroupProps {
	status: PlanStatus
	plans: IPlanSummary[]
	onPlanClick: (planId: string) => void
}

const STATUS_CONFIG: Record<PlanStatus, { label: string; dotColor: string }> = {
	draft: { label: "Draft", dotColor: "bg-gray-400" },
	refined: { label: "Refined", dotColor: "bg-blue-400" },
	approved: { label: "Approved", dotColor: "bg-green-400" },
	exported: { label: "Exported", dotColor: "bg-purple-400" },
}

export function SidebarPlanGroup({ status, plans, onPlanClick }: SidebarPlanGroupProps) {
	const [expanded, setExpanded] = useState(status === "draft" || status === "approved")

	if (plans.length === 0) return null

	const config = STATUS_CONFIG[status]

	return (
		<div>
			<button
				onClick={() => setExpanded(!expanded)}
				className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text-primary dark:hover:text-dark-text-primary transition-colors"
			>
				<svg
					className={`w-3 h-3 transition-transform ${expanded ? "rotate-90" : ""}`}
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
				</svg>
				<span className={`w-2 h-2 rounded-full ${config.dotColor}`} />
				{config.label}
				<span className="ml-auto text-xs font-normal">{plans.length}</span>
			</button>

			{expanded && (
				<div className="space-y-0.5 mt-0.5">
					{plans.map((plan) => (
						<button
							key={plan.id}
							onClick={() => onPlanClick(plan.id)}
							className="w-full text-left px-3 py-1.5 pl-8 rounded-lg hover:bg-light-surface dark:hover:bg-dark-surface transition-colors"
						>
							<div className="text-sm text-light-text-primary dark:text-dark-text-primary truncate">
								{plan.title}
							</div>
							<div className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
								{plan.repositories.slice(0, 2).join(", ")}
								{plan.repositories.length > 2 && ` +${plan.repositories.length - 2}`}
								{" · "}
								{plan.stepCount} step{plan.stepCount !== 1 ? "s" : ""}
							</div>
						</button>
					))}
				</div>
			)}
		</div>
	)
}
