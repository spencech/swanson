import { useState, useRef, useEffect, useImperativeHandle, forwardRef, KeyboardEvent } from 'react'
import { useChatStore } from '../stores/chatStore'

interface ChatInputProps {
	onSend: (message: string) => void
	disabled?: boolean
}

export const ChatInput = forwardRef<HTMLTextAreaElement, ChatInputProps>(
	function ChatInput({ onSend, disabled }, ref) {
		const [input, setInput] = useState('')
		const textareaRef = useRef<HTMLTextAreaElement>(null)
		const isProcessing = useChatStore((state) => state.isProcessing)

		// Forward ref to internal textarea
		useImperativeHandle(ref, () => textareaRef.current!, [])

		// Auto-resize textarea
		useEffect(() => {
			const textarea = textareaRef.current
			if (textarea) {
				textarea.style.height = 'auto'
				textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`
			}
		}, [input])

		const handleSubmit = () => {
			const trimmed = input.trim()
			if (trimmed && !disabled && !isProcessing) {
				onSend(trimmed)
				setInput('')
				// Reset textarea height
				if (textareaRef.current) {
					textareaRef.current.style.height = 'auto'
				}
			}
		}

		const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
			if (e.key === 'Enter' && !e.shiftKey) {
				e.preventDefault()
				handleSubmit()
			}
		}

		const isDisabled = disabled || isProcessing

		return (
			<div className="border-t border-light-border dark:border-dark-border bg-light-bg dark:bg-dark-bg">
				<div className="max-w-3xl mx-auto px-4 py-4">
					<div className="relative flex items-end gap-2 bg-light-surface dark:bg-dark-surface rounded-2xl border border-light-border dark:border-dark-border focus-within:border-light-accent dark:focus-within:border-dark-accent transition-colors">
						<textarea
							ref={textareaRef}
							value={input}
							onChange={(e) => setInput(e.target.value)}
							onKeyDown={handleKeyDown}
							placeholder="Describe a feature or enter a JIRA ticket (e.g., PD-1234)..."
							disabled={isDisabled}
							rows={1}
							autoComplete="off"
							className="flex-1 resize-none bg-transparent px-4 py-3 text-sm text-light-text-primary dark:text-dark-text-primary placeholder-light-text-secondary dark:placeholder-dark-text-secondary focus:outline-none disabled:opacity-50 self-center"
						/>
						<button
							onClick={handleSubmit}
							disabled={isDisabled || !input.trim()}
							className="m-2 p-2 rounded-xl bg-light-accent dark:bg-dark-accent text-white disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
							aria-label="Send message"
						>
							<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
							</svg>
						</button>
					</div>
					<p className="mt-2 text-xs text-center text-light-text-secondary dark:text-dark-text-secondary">
						Press Enter to send, Shift+Enter for new line
					</p>
				</div>
			</div>
		)
	}
)
