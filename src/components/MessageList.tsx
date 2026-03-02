import { useEffect, useRef } from 'react'
import { useChatStore } from '../stores/chatStore'
import { useThreadStore } from '../stores/threadStore'
import { MessageBubble } from './MessageBubble'
import { SwansonThinking } from './SwansonThinking'

interface MessageListProps {
	onEditRequest?: () => void
}

export function MessageList({ onEditRequest }: MessageListProps) {
	const messages = useChatStore((state) => state.messages)
	const isProcessing = useChatStore((state) => state.isProcessing)
	const containerRef = useRef<HTMLDivElement>(null)

	const activeThreadId = useThreadStore((state) => state.activeThreadId)
	const threads = useThreadStore((state) => state.threads)
	const activeThread = threads.find((t) => t.id === activeThreadId)
	const isQuestion = activeThread?.mode === "question"

	// Get the content of the last message for scroll tracking during streaming
	const lastMessageContent = messages[messages.length - 1]?.content

	// Auto-scroll to bottom when messages change or content streams in
	useEffect(() => {
		const container = containerRef.current
		if (container) {
			container.scrollTop = container.scrollHeight
		}
	}, [messages.length, lastMessageContent])

	if (messages.length === 0) {
		return (
			<div className="flex-1 flex items-center justify-center">
				<div className="text-center max-w-md px-4">
					<h2 className="text-2xl font-semibold text-light-text-primary dark:text-dark-text-primary mb-3">
						{isQuestion ? "What do you want to know?" : "What would you like to build?"}
					</h2>
					<p className="text-light-text-secondary dark:text-dark-text-secondary">
						{isQuestion
							? "Ask about architecture, conventions, code patterns, or anything in the codebase."
							: "Describe a feature or paste a JIRA ticket number to get started."}
					</p>
				</div>
			</div>
		)
	}

	return (
		<div ref={containerRef} className="flex-1 overflow-y-auto">
			<div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
				{messages.map((message) => (
					<MessageBubble key={message.id} message={message} onEditRequest={onEditRequest} />
				))}

				{/* Thinking indicator with rotating Swanson quotes — visible until real content streams in */}
				{isProcessing && !messages.some(m => m.isStreaming && m.content && !m.content.trimStart().startsWith("<swanson-response>")) && (
					<SwansonThinking />
				)}

				<div />
			</div>
		</div>
	)
}
