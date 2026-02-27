import { useRef, useCallback } from 'react'
import { MessageList } from './MessageList'
import { ChatInput } from './ChatInput'
import { useOpenClaw } from '../hooks/useOpenClaw'
import { useChatStore } from '../stores/chatStore'
import { useThreadStore } from '../stores/threadStore'

export function ChatContainer() {
	const { sendMessage, stopSession, connectionState, connectionError } = useOpenClaw()
	const isProcessing = useChatStore((state) => state.isProcessing)
	const messages = useChatStore((state) => state.messages)
	const activeThreadId = useThreadStore((state) => state.activeThreadId)
	const renameThread = useThreadStore((state) => state.renameThread)
	const chatInputRef = useRef<HTMLTextAreaElement>(null)

	const handleSend = async (content: string) => {
		// Auto-set thread title from first user message
		if (activeThreadId && messages.length === 0) {
			const title = content.length > 60 ? content.slice(0, 57) + "..." : content
			renameThread(activeThreadId, title)
		}
		await sendMessage(content)
	}

	const handleEditRequest = useCallback(() => {
		// Scroll to and focus the chat input for plan refinement
		chatInputRef.current?.focus()
	}, [])

	return (
		<div className="flex-1 flex flex-col overflow-hidden relative">
			{/* Connection status banner */}
			{connectionState !== 'connected' && (
				<div className={`px-4 py-2 text-sm text-center ${
					connectionState === 'reconnecting'
						? 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300'
						: 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
				}`}>
					{connectionState === 'reconnecting'
						? 'Reconnecting to server...'
						: connectionError || 'Disconnected from server'}
				</div>
			)}

			<MessageList onEditRequest={handleEditRequest} />
			<ChatInput
				ref={chatInputRef}
				onSend={handleSend}
				disabled={connectionState !== 'connected'}
			/>

			{/* Stop button when processing */}
			{isProcessing && (
				<div className="absolute bottom-24 left-1/2 -translate-x-1/2">
					<button
						onClick={stopSession}
						className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium shadow-lg transition-colors"
					>
						Stop Generation
					</button>
				</div>
			)}
		</div>
	)
}
