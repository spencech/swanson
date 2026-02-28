import { useEffect, useCallback } from 'react'
import { useThreadStore } from '../stores/threadStore'
import { useChatStore } from '../stores/chatStore'
import { usePlanStore } from '../stores/planStore'
import type { IThreadSummary, ThreadMode } from '../../shared/types'

export function useThreads() {
	const threads = useThreadStore((state) => state.threads)
	const plans = useThreadStore((state) => state.plans)
	const activeThreadId = useThreadStore((state) => state.activeThreadId)
	const setActiveThread = useThreadStore((state) => state.setActiveThread)
	const addThread = useThreadStore((state) => state.addThread)
	const removeThread = useThreadStore((state) => state.removeThread)
	const renameThread = useThreadStore((state) => state.renameThread)
	const clearMessages = useChatStore((state) => state.clearMessages)
	const clearPlan = usePlanStore((state) => state.clearPlan)

	// Load cached thread/plan lists from electron-store on mount
	useEffect(() => {
		// Cache loading would happen here when the server-side persistence is wired up
		// For now, threads and plans are managed in memory
	}, [])

	const createThread = useCallback((mode: ThreadMode) => {
		const newThread: IThreadSummary = {
			id: crypto.randomUUID(),
			title: mode === "question" ? "New Question" : mode === "artifact" ? "New Artifact" : "New Work Order",
			mode,
			userEmail: "",
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			planIds: [],
			messagePreview: "",
		}
		addThread(newThread)
		clearMessages()
		clearPlan()
		setActiveThread(newThread.id)
		return newThread
	}, [addThread, clearMessages, clearPlan, setActiveThread])

	const switchThread = useCallback((threadId: string) => {
		if (threadId === activeThreadId) return
		clearMessages()
		clearPlan()
		setActiveThread(threadId)
		// Thread history loading would happen here via server request
	}, [activeThreadId, clearMessages, clearPlan, setActiveThread])

	const deleteThread = useCallback((threadId: string) => {
		removeThread(threadId)
		if (threadId === activeThreadId) {
			clearMessages()
			clearPlan()
		}
	}, [activeThreadId, removeThread, clearMessages, clearPlan])

	const closeThread = useCallback(() => {
		clearMessages()
		clearPlan()
		setActiveThread(null)
	}, [clearMessages, clearPlan, setActiveThread])

	return {
		threads,
		plans,
		activeThreadId,
		createThread,
		switchThread,
		deleteThread,
		renameThread,
		closeThread,
	}
}
