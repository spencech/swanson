import { useMemo } from 'react'
import DOMPurify from 'dompurify'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Message } from '../stores/chatStore'
import { usePlanStore } from '../stores/planStore'
import { PlanCard } from './PlanCard'
import type { IPlan } from '../../shared/types'

const ALLOWED_TAGS = [
	"h1", "h2", "h3", "h4", "h5", "h6", "p", "div", "span",
	"table", "thead", "tbody", "tr", "th", "td",
	"ul", "ol", "li", "dl", "dt", "dd",
	"code", "pre", "blockquote",
	"strong", "em", "a", "br", "hr",
]

function tryParseHtml(content: string): string | null {
	const match = content.match(/<swanson-response>([\s\S]*?)<\/swanson-response>/)
	if (!match) return null
	return DOMPurify.sanitize(match[1], { ALLOWED_TAGS, ALLOWED_ATTR: ["href", "target", "class"] })
}

interface MessageBubbleProps {
	message: Message
	onEditRequest?: () => void
}

function tryParsePlan(content: string): IPlan | null {
	// Look for a JSON block that looks like a plan
	// The agent may wrap it in ```json ... ``` or send it as raw JSON
	const jsonBlockMatch = content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/)
	const candidate = jsonBlockMatch ? jsonBlockMatch[1] : null

	// Also try the raw content if it starts with {
	const rawCandidate = content.trimStart().startsWith("{") ? content.trim() : null

	for (const text of [candidate, rawCandidate]) {
		if (!text) continue
		try {
			const parsed = JSON.parse(text)
			if (
				parsed &&
				typeof parsed === "object" &&
				typeof parsed.id === "string" &&
				typeof parsed.title === "string" &&
				typeof parsed.narrative === "string" &&
				Array.isArray(parsed.steps)
			) {
				return parsed as IPlan
			}
		} catch {
			// Not valid JSON
		}
	}

	return null
}

export function MessageBubble({ message, onEditRequest }: MessageBubbleProps) {
	const isUser = message.role === "user"
	const setCurrentPlan = usePlanStore((state) => state.setCurrentPlan)
	const currentPlan = usePlanStore((state) => state.currentPlan)

	// Check if this message contains a plan
	const detectedPlan = useMemo(() => {
		if (isUser || message.isStreaming) return null
		return tryParsePlan(message.content)
	}, [message.content, message.isStreaming, isUser])

	// If a plan is detected and it's newer or different from the current, update it
	const isPlanMessage = detectedPlan !== null
	const isNewerPlan = isPlanMessage && (
		!currentPlan ||
		currentPlan.id !== detectedPlan.id ||
		JSON.stringify(currentPlan) !== JSON.stringify(detectedPlan)
	)
	if (isNewerPlan) {
		// Schedule state update for next tick to avoid render-time set
		Promise.resolve().then(() => setCurrentPlan(detectedPlan))
	}

	// Extract any text before/after the JSON block for context
	const textBeforePlan = useMemo(() => {
		if (!isPlanMessage) return null
		const jsonBlockMatch = message.content.match(/```(?:json)?\s*\{[\s\S]*?\}\s*```/)
		if (jsonBlockMatch && jsonBlockMatch.index !== undefined) {
			const before = message.content.slice(0, jsonBlockMatch.index).trim()
			return before || null
		}
		// If the entire message is JSON, no surrounding text
		if (message.content.trimStart().startsWith("{")) return null
		return null
	}, [message.content, isPlanMessage])

	// Check if this message contains structured HTML (from question mode)
	const sanitizedHtml = useMemo(() => {
		if (isUser || message.isStreaming) return null
		return tryParseHtml(message.content)
	}, [message.content, message.isStreaming, isUser])

	if (isPlanMessage) {
		return (
			<div className="flex justify-start">
				<div className="max-w-[90%] space-y-3">
					{textBeforePlan && (
						<div className="bg-light-surface dark:bg-dark-surface px-4 py-3 rounded-2xl rounded-bl-md">
							<div className="whitespace-pre-wrap break-words text-sm leading-relaxed text-light-text-primary dark:text-dark-text-primary">
								{textBeforePlan}
							</div>
						</div>
					)}
					<PlanCard onEditRequest={onEditRequest} />
				</div>
			</div>
		)
	}

	// Render DOMPurify-sanitized HTML for structured question responses
	if (sanitizedHtml) {
		return (
			<div className="flex justify-start">
				<div className="max-w-[90%] bg-light-surface dark:bg-dark-surface px-5 py-4 rounded-2xl rounded-bl-md">
					<div
						className="prose-swanson text-sm text-light-text-primary dark:text-dark-text-primary"
						dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
					/>
				</div>
			</div>
		)
	}

	return (
		<div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
			<div
				className={`max-w-[80%] px-4 py-3 rounded-2xl ${
					isUser
						? "bg-light-accent dark:bg-dark-accent text-white rounded-br-md"
						: "bg-light-surface dark:bg-dark-surface text-light-text-primary dark:text-dark-text-primary rounded-bl-md"
				}`}
			>
				{isUser ? (
					<div className="whitespace-pre-wrap break-words text-sm leading-relaxed">
						{message.content}
					</div>
				) : (
					<div className="prose-swanson text-sm text-light-text-primary dark:text-dark-text-primary">
						<ReactMarkdown remarkPlugins={[remarkGfm]}>
							{message.content}
						</ReactMarkdown>
						{message.isStreaming && (
							<span className="inline-block w-2 h-4 ml-1 bg-current animate-pulse" />
						)}
					</div>
				)}
			</div>
		</div>
	)
}
