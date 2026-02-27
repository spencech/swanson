import { PlanNarrative } from './PlanNarrative'
import { PlanTechnicalDetail } from './PlanTechnicalDetail'
import { PlanActions } from './PlanActions'
import { usePlan } from '../hooks/usePlan'

interface PlanCardProps {
	onEditRequest?: () => void
}

export function PlanCard({ onEditRequest }: PlanCardProps) {
	const {
		currentPlan,
		isShowingTechnicalDetail,
		toggleTechnicalDetail,
		approvePlan,
		exportYaml,
		copyJson,
	} = usePlan()

	if (!currentPlan) return null

	return (
		<div className="bg-light-bg dark:bg-dark-bg border border-light-border dark:border-dark-border rounded-xl overflow-hidden">
			{/* Narrative section */}
			<div className="p-4">
				<PlanNarrative plan={currentPlan} />
			</div>

			{/* Actions bar */}
			<div className="px-4 pb-3">
				<PlanActions
					status={currentPlan.status}
					isShowingTechnicalDetail={isShowingTechnicalDetail}
					onToggleTechnicalDetail={toggleTechnicalDetail}
					onApprove={approvePlan}
					onExportYaml={exportYaml}
					onCopyJson={copyJson}
					onEdit={onEditRequest || (() => {})}
				/>
			</div>

			{/* Technical detail (expandable) */}
			{isShowingTechnicalDetail && (
				<div className="border-t border-light-border dark:border-dark-border p-4">
					<PlanTechnicalDetail plan={currentPlan} />
				</div>
			)}
		</div>
	)
}
