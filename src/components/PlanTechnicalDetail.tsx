import type { IPlan } from '../../shared/types'
import { PlanStepList } from './PlanStepList'

interface PlanTechnicalDetailProps {
	plan: IPlan
}

export function PlanTechnicalDetail({ plan }: PlanTechnicalDetailProps) {
	return (
		<div className="space-y-4">
			{/* Context: repos, files, patterns */}
			<div className="grid grid-cols-2 gap-3">
				{/* Affected files */}
				{plan.context.affected_files.length > 0 && (
					<div>
						<div className="text-xs font-semibold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary mb-1.5">
							Affected Files
						</div>
						<div className="space-y-0.5">
							{plan.context.affected_files.map((file) => (
								<div
									key={file}
									className="text-xs font-mono text-light-text-secondary dark:text-dark-text-secondary px-2 py-0.5 rounded bg-light-surface dark:bg-dark-surface"
								>
									{file}
								</div>
							))}
						</div>
					</div>
				)}

				{/* New files */}
				{plan.context.new_files.length > 0 && (
					<div>
						<div className="text-xs font-semibold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary mb-1.5">
							New Files
						</div>
						<div className="space-y-0.5">
							{plan.context.new_files.map((file) => (
								<div
									key={file}
									className="text-xs font-mono text-green-600 dark:text-green-400 px-2 py-0.5 rounded bg-light-surface dark:bg-dark-surface"
								>
									+ {file}
								</div>
							))}
						</div>
					</div>
				)}
			</div>

			{/* Patterns referenced */}
			{plan.context.patterns_referenced.length > 0 && (
				<div>
					<div className="text-xs font-semibold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary mb-1.5">
						Patterns Referenced
					</div>
					<div className="flex flex-wrap gap-1.5">
						{plan.context.patterns_referenced.map((pattern) => (
							<span
								key={pattern}
								className="px-2 py-0.5 text-xs rounded bg-light-surface dark:bg-dark-surface text-light-text-secondary dark:text-dark-text-secondary border border-light-border dark:border-dark-border font-mono"
							>
								{pattern}
							</span>
						))}
					</div>
				</div>
			)}

			{/* Steps */}
			<div>
				<div className="text-xs font-semibold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary mb-2">
					Steps ({plan.steps.length})
				</div>
				<PlanStepList steps={plan.steps} />
			</div>

			{/* Overall acceptance criteria */}
			{plan.acceptance_criteria.length > 0 && (
				<div>
					<div className="text-xs font-semibold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary mb-1.5">
						Overall Acceptance Criteria
					</div>
					<ul className="space-y-1 text-sm text-light-text-primary dark:text-dark-text-primary">
						{plan.acceptance_criteria.map((ac, i) => (
							<li key={i} className="flex items-start gap-2">
								<span className="mt-0.5 text-light-text-secondary dark:text-dark-text-secondary">-</span>
								<span>{ac}</span>
							</li>
						))}
					</ul>
				</div>
			)}

			{/* Spawnee config */}
			{plan.spawnee_config && (
				<div className="text-xs text-light-text-secondary dark:text-dark-text-secondary border-t border-light-border dark:border-dark-border pt-3">
					<span className="font-medium">Spawnee:</span>{" "}
					model: {plan.spawnee_config.model}, branch: {plan.spawnee_config.branch_prefix}
				</div>
			)}
		</div>
	)
}
