import { useState } from 'react'
import type { IPlanStep } from '../../shared/types'

interface PlanStepListProps {
	steps: IPlanStep[]
}

export function PlanStepList({ steps }: PlanStepListProps) {
	const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set())

	const toggleStep = (stepId: string) => {
		setExpandedSteps((prev) => {
			const next = new Set(prev)
			if (next.has(stepId)) {
				next.delete(stepId)
			} else {
				next.add(stepId)
			}
			return next
		})
	}

	return (
		<div className="space-y-2">
			{steps.map((step, index) => {
				const isExpanded = expandedSteps.has(step.id)
				return (
					<div
						key={step.id}
						className="border border-light-border dark:border-dark-border rounded-lg overflow-hidden"
					>
						{/* Step header */}
						<button
							onClick={() => toggleStep(step.id)}
							className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-light-surface dark:hover:bg-dark-surface transition-colors"
						>
							<span className="shrink-0 w-6 h-6 rounded-full bg-light-accent dark:bg-dark-accent text-white text-xs flex items-center justify-center font-medium">
								{index + 1}
							</span>
							<div className="flex-1 min-w-0">
								<div className="text-sm font-medium text-light-text-primary dark:text-dark-text-primary truncate">
									{step.title}
								</div>
								<div className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
									{step.repository}
									{step.dependencies.length > 0 && (
										<span className="ml-2 text-light-text-secondary dark:text-dark-text-secondary">
											depends on: {step.dependencies.join(", ")}
										</span>
									)}
								</div>
							</div>
							<svg
								className={`w-4 h-4 shrink-0 text-light-text-secondary dark:text-dark-text-secondary transition-transform ${isExpanded ? "rotate-180" : ""}`}
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
							>
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
							</svg>
						</button>

						{/* Step details */}
						{isExpanded && (
							<div className="px-3 pb-3 border-t border-light-border dark:border-dark-border">
								<div className="pt-3 space-y-3 text-sm">
									{/* Description */}
									<div className="text-light-text-primary dark:text-dark-text-primary leading-relaxed whitespace-pre-wrap">
										{step.description}
									</div>

									{/* Files */}
									{step.files.length > 0 && (
										<div>
											<div className="text-xs font-semibold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary mb-1">
												Files
											</div>
											<div className="space-y-0.5">
												{step.files.map((file) => (
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

									{/* Acceptance criteria */}
									{step.acceptance_criteria.length > 0 && (
										<div>
											<div className="text-xs font-semibold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary mb-1">
												Acceptance Criteria
											</div>
											<ul className="space-y-1 text-xs text-light-text-primary dark:text-dark-text-primary">
												{step.acceptance_criteria.map((ac, i) => (
													<li key={i} className="flex items-start gap-1.5">
														<span className="mt-0.5 text-light-text-secondary dark:text-dark-text-secondary">-</span>
														<span>{ac}</span>
													</li>
												))}
											</ul>
										</div>
									)}
								</div>
							</div>
						)}
					</div>
				)
			})}
		</div>
	)
}
