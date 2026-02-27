import { create } from 'zustand'
import type { IThreadSummary, IPlanSummary } from '../../shared/types'

interface ThreadState {
	threads: IThreadSummary[]
	plans: IPlanSummary[]
	activeThreadId: string | null
	sidebarCollapsed: boolean
	setThreads: (threads: IThreadSummary[]) => void
	setPlans: (plans: IPlanSummary[]) => void
	addThread: (thread: IThreadSummary) => void
	removeThread: (threadId: string) => void
	renameThread: (threadId: string, title: string) => void
	setActiveThread: (threadId: string | null) => void
	updatePlan: (plan: IPlanSummary) => void
	toggleSidebar: () => void
	setSidebarCollapsed: (collapsed: boolean) => void
}

export const useThreadStore = create<ThreadState>((set) => ({
	threads: [],
	plans: [],
	activeThreadId: null,
	sidebarCollapsed: false,

	setThreads: (threads) => {
		set({ threads })
	},

	setPlans: (plans) => {
		set({ plans })
	},

	addThread: (thread) => {
		set((state) => ({
			threads: [thread, ...state.threads],
		}))
	},

	removeThread: (threadId) => {
		set((state) => ({
			threads: state.threads.filter((t) => t.id !== threadId),
			activeThreadId: state.activeThreadId === threadId ? null : state.activeThreadId,
		}))
	},

	renameThread: (threadId, title) => {
		set((state) => ({
			threads: state.threads.map((t) =>
				t.id === threadId ? { ...t, title } : t
			),
		}))
	},

	setActiveThread: (threadId) => {
		set({ activeThreadId: threadId })
	},

	updatePlan: (plan) => {
		set((state) => {
			const existing = state.plans.findIndex((p) => p.id === plan.id)
			if (existing >= 0) {
				const updated = [...state.plans]
				updated[existing] = plan
				return { plans: updated }
			}
			return { plans: [plan, ...state.plans] }
		})
	},

	toggleSidebar: () => {
		set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed }))
	},

	setSidebarCollapsed: (collapsed) => {
		set({ sidebarCollapsed: collapsed })
	},
}))
