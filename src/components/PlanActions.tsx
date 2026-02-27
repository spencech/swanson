import type { PlanStatus } from '../../shared/types'

interface PlanActionsProps {
	status: PlanStatus
	isShowingTechnicalDetail: boolean
	onToggleTechnicalDetail: () => void
	onApprove: () => void
	onExportYaml: () => void
	onCopyJson: () => void
	onEdit: () => void
}

export function PlanActions({
	status,
	isShowingTechnicalDetail,
	onToggleTechnicalDetail,
	onApprove,
	onExportYaml,
	onCopyJson,
	onEdit,
}: PlanActionsProps) {
	return (
		<div className="flex items-center gap-2 flex-wrap">
			{/* Technical detail toggle */}
			<button
				onClick={onToggleTechnicalDetail}
				className="px-3 py-1.5 text-xs font-medium rounded-lg border border-light-border dark:border-dark-border text-light-text-secondary dark:text-dark-text-secondary hover:bg-light-surface dark:hover:bg-dark-surface transition-colors"
			>
				{isShowingTechnicalDetail ? "Hide technical detail" : "Show technical detail"}
			</button>

			{/* Edit - return to chat refinement */}
			{(status === "draft" || status === "refined") && (
				<button
					onClick={onEdit}
					className="px-3 py-1.5 text-xs font-medium rounded-lg border border-light-border dark:border-dark-border text-light-text-secondary dark:text-dark-text-secondary hover:bg-light-surface dark:hover:bg-dark-surface transition-colors"
				>
					Edit
				</button>
			)}

			{/* Approve */}
			{(status === "draft" || status === "refined") && (
				<button
					onClick={onApprove}
					className="px-3 py-1.5 text-xs font-medium rounded-lg bg-green-600 hover:bg-green-700 text-white transition-colors"
				>
					Approve
				</button>
			)}

			{/* Download YAML */}
			{(status === "approved" || status === "exported") && (
				<button
					onClick={onExportYaml}
					className="px-3 py-1.5 text-xs font-medium rounded-lg bg-light-accent dark:bg-dark-accent hover:opacity-90 text-white transition-colors"
				>
					Download YAML
				</button>
			)}

			{/* Copy JSON */}
			<button
				onClick={onCopyJson}
				className="px-3 py-1.5 text-xs font-medium rounded-lg border border-light-border dark:border-dark-border text-light-text-secondary dark:text-dark-text-secondary hover:bg-light-surface dark:hover:bg-dark-surface transition-colors"
			>
				Copy JSON
			</button>
		</div>
	)
}
