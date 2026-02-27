import { useCallback } from 'react'
import { usePlanStore } from '../stores/planStore'
import type { IPlan } from '../../shared/types'

export function usePlan() {
	const currentPlan = usePlanStore((state) => state.currentPlan)
	const isShowingTechnicalDetail = usePlanStore((state) => state.isShowingTechnicalDetail)
	const setCurrentPlan = usePlanStore((state) => state.setCurrentPlan)
	const updatePlanStatus = usePlanStore((state) => state.updatePlanStatus)
	const toggleTechnicalDetail = usePlanStore((state) => state.toggleTechnicalDetail)
	const clearPlan = usePlanStore((state) => state.clearPlan)

	const approvePlan = useCallback(async () => {
		if (!currentPlan || !window.electronAPI?.openclaw) return
		updatePlanStatus("approved")
		// Server-side approval would be sent via a plan:approve message
		// For now, the status update is local
	}, [currentPlan, updatePlanStatus])

	const exportYaml = useCallback(async () => {
		if (!currentPlan) return
		// Request YAML conversion from the server
		// For now, we trigger a download of the plan JSON as a fallback
		const yaml = convertPlanToYamlFallback(currentPlan)
		const blob = new Blob([yaml], { type: "text/yaml" })
		const url = URL.createObjectURL(blob)
		const a = document.createElement("a")
		a.href = url
		a.download = `${currentPlan.title.toLowerCase().replace(/\s+/g, "-")}.yaml`
		document.body.appendChild(a)
		a.click()
		document.body.removeChild(a)
		URL.revokeObjectURL(url)
	}, [currentPlan])

	const copyJson = useCallback(async () => {
		if (!currentPlan) return
		await navigator.clipboard.writeText(JSON.stringify(currentPlan, null, 2))
	}, [currentPlan])

	return {
		currentPlan,
		isShowingTechnicalDetail,
		setCurrentPlan,
		updatePlanStatus,
		toggleTechnicalDetail,
		clearPlan,
		approvePlan,
		exportYaml,
		copyJson,
	}
}

function convertPlanToYamlFallback(plan: IPlan): string {
	const branchPrefix = plan.spawnee_config?.branch_prefix || `spawnee/${plan.title.toLowerCase().replace(/\s+/g, "-")}`

	const tasks = plan.steps.map((step) => {
		const deps = step.dependencies.length > 0
			? `\n    dependsOn:\n${step.dependencies.map((d) => `      - ${d}`).join("\n")}`
			: "\n    dependsOn: []"

		const mergePrereq = step.dependencies.length > 0
			? `\n      ## PREREQUISITE: Merge Dependency Branch\n      \`\`\`bash\n      git fetch origin\n${step.dependencies.map((d) => `      git merge origin/cursor/${branchPrefix}-${d} --no-edit`).join("\n")}\n      \`\`\`\n      Verify the merge succeeded before proceeding.\n\n`
			: ""

		return `  - id: ${step.id}
    name: "${step.title}"
    branch: "cursor/${branchPrefix}-${step.id}"${step.repository ? `\n    repository:\n      url: "https://github.com/TeachUpbeat/${step.repository}.git"\n      branch: "${branchPrefix}"\n      baseBranch: "${branchPrefix}"` : ""}${deps}
    prompt: |${mergePrereq}
      ## Task: ${step.title}

      ${step.description}

      ## Files
${step.files.map((f) => `      - ${f}`).join("\n")}

      ## Acceptance Criteria
${step.acceptance_criteria.map((ac) => `      - ${ac}`).join("\n")}`
	})

	return `name: "${plan.title}"
repository:
  url: "https://github.com/TeachUpbeat/${plan.context.repositories[0] || "unknown"}.git"
  branch: "${branchPrefix}"
  baseBranch: "${branchPrefix}"
model: "${plan.spawnee_config?.model || "composer-1"}"

tasks:
${tasks.join("\n\n")}
`
}
