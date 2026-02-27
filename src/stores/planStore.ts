import { create } from 'zustand'
import type { IPlan, PlanStatus } from '../../shared/types'

interface PlanState {
	currentPlan: IPlan | null
	isShowingTechnicalDetail: boolean
	setCurrentPlan: (plan: IPlan | null) => void
	updatePlanStatus: (status: PlanStatus) => void
	toggleTechnicalDetail: () => void
	clearPlan: () => void
}

export const usePlanStore = create<PlanState>((set) => ({
	currentPlan: null,
	isShowingTechnicalDetail: false,

	setCurrentPlan: (plan) => {
		set({ currentPlan: plan })
	},

	updatePlanStatus: (status) => {
		set((state) => {
			if (!state.currentPlan) return state
			return {
				currentPlan: { ...state.currentPlan, status, updatedAt: new Date().toISOString() },
			}
		})
	},

	toggleTechnicalDetail: () => {
		set((state) => ({ isShowingTechnicalDetail: !state.isShowingTechnicalDetail }))
	},

	clearPlan: () => {
		set({ currentPlan: null, isShowingTechnicalDetail: false })
	},
}))
