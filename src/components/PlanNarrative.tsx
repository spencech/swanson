import type { IPlan } from '../../shared/types'

interface PlanNarrativeProps {
	plan: IPlan
}

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
	draft: { label: "Draft", className: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" },
	refined: { label: "Refined", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
	approved: { label: "Approved", className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" },
	exported: { label: "Exported", className: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300" },
}

export function PlanNarrative({ plan }: PlanNarrativeProps) {
	const status = STATUS_LABELS[plan.status] || STATUS_LABELS.draft

	return (
		<div className="space-y-4">
			{/* Title and status */}
			<div className="flex items-start justify-between gap-3">
				<h3 className="text-lg font-semibold text-light-text-primary dark:text-dark-text-primary leading-tight">
					{plan.title}
				</h3>
				<span className={`shrink-0 px-2.5 py-0.5 rounded-full text-xs font-medium ${status.className}`}>
					{status.label}
				</span>
			</div>

			{/* Narrative */}
			<div className="text-sm text-light-text-primary dark:text-dark-text-primary leading-relaxed whitespace-pre-wrap">
				{plan.narrative}
			</div>

			{/* Q&A section */}
			{plan.questions_resolved.length > 0 && (
				<div className="border-t border-light-border dark:border-dark-border pt-4">
					<h4 className="text-xs font-semibold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary mb-3">
						Questions Resolved
					</h4>
					<div className="space-y-3">
						{plan.questions_resolved.map((qa, i) => (
							<div key={i} className="text-sm">
								<div className="font-medium text-light-text-primary dark:text-dark-text-primary">
									{qa.question}
								</div>
								<div className="mt-0.5 text-light-text-secondary dark:text-dark-text-secondary">
									{qa.answer}
								</div>
							</div>
						))}
					</div>
				</div>
			)}

			{/* Repo tags */}
			{plan.context.repositories.length > 0 && (
				<div className="flex flex-wrap gap-1.5">
					{plan.context.repositories.map((repo) => (
						<span
							key={repo}
							className="px-2 py-0.5 text-xs rounded bg-light-surface dark:bg-dark-surface text-light-text-secondary dark:text-dark-text-secondary border border-light-border dark:border-dark-border"
						>
							{repo}
						</span>
					))}
				</div>
			)}
		</div>
	)
}
