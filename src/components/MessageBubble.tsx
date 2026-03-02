import { useMemo, useState, useCallback } from 'react'
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

interface IArtifact {
	filename: string
	mimeType: string
	content: string
}

function tryParseArtifact(content: string): IArtifact | null {
	const match = content.match(
		/<swanson-artifact\s+filename="([^"]+)"\s+mime="([^"]+)"[^>]*>([\s\S]*?)<\/swanson-artifact>/
	)
	if (!match) return null
	return { filename: match[1], mimeType: match[2], content: match[3].trim() }
}

function CopyButton({ text }: { text: string }) {
	const [copied, setCopied] = useState(false)

	const handleCopy = useCallback(() => {
		navigator.clipboard.writeText(text).then(() => {
			setCopied(true)
			setTimeout(() => setCopied(false), 2000)
		})
	}, [text])

	return (
		<button
			onClick={handleCopy}
			className="opacity-0 group-hover:opacity-100 transition-opacity absolute top-2 right-2 p-1.5 rounded-md bg-light-bg/80 dark:bg-dark-bg/80 hover:bg-light-border dark:hover:bg-dark-border text-light-text-secondary dark:text-dark-text-secondary"
			title="Copy to clipboard"
		>
			{copied ? (
				<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
					<polyline points="20 6 9 17 4 12" />
				</svg>
			) : (
				<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
					<rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
					<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
				</svg>
			)}
		</button>
	)
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

	// Check if this message contains a downloadable artifact
	const artifact = useMemo(() => {
		if (isUser || message.isStreaming) return null
		return tryParseArtifact(message.content)
	}, [message.content, message.isStreaming, isUser])

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

	// Render artifact: scrollable preview + download button
	if (artifact) {
		const handleDownload = () => {
			const blob = new Blob([artifact.content], { type: artifact.mimeType })
			const url = URL.createObjectURL(blob)
			const a = document.createElement("a")
			a.href = url
			a.download = artifact.filename
			document.body.appendChild(a)
			a.click()
			document.body.removeChild(a)
			URL.revokeObjectURL(url)
		}
		return (
			<div className="flex justify-start">
				<div className="max-w-[90%] bg-light-surface dark:bg-dark-surface rounded-2xl rounded-bl-md overflow-hidden">
					{/* Header: filename + actions */}
					<div className="flex items-center justify-between gap-3 px-4 py-2 border-b border-light-border dark:border-dark-border bg-light-bg dark:bg-dark-bg">
						<span className="text-xs font-mono text-light-text-secondary dark:text-dark-text-secondary truncate">
							{artifact.filename}
						</span>
						<div className="flex items-center gap-2 shrink-0">
							<CopyButton text={artifact.content} />
							<button
								onClick={handleDownload}
								className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-light-accent dark:bg-dark-accent text-white text-xs font-medium hover:opacity-90 transition-opacity"
							>
								<svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
								</svg>
								Download
							</button>
						</div>
					</div>
					{/* Scrollable content preview */}
					<div className="px-5 py-4 prose-swanson text-sm text-light-text-primary dark:text-dark-text-primary max-h-[400px] overflow-y-auto">
						<ReactMarkdown remarkPlugins={[remarkGfm]}>{artifact.content}</ReactMarkdown>
					</div>
				</div>
			</div>
		)
	}

	// Render DOMPurify-sanitized HTML for structured question responses
	if (sanitizedHtml) {
		return (
			<div className="flex justify-start">
				<div className="group relative max-w-[90%] bg-light-surface dark:bg-dark-surface px-5 py-4 rounded-2xl rounded-bl-md">
					<CopyButton text={message.content} />
					<div
						className="prose-swanson text-sm text-light-text-primary dark:text-dark-text-primary"
						dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
					/>
				</div>
			</div>
		)
	}

	// Hide the empty streaming placeholder — SwansonThinking covers this state
	// Also hide streaming HTML responses so raw markup isn't visible mid-stream
	if (message.isStreaming && (!message.content || message.content.trimStart().startsWith("<swanson-response>"))) return null

	return (
		<div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
			<div
				className={`${isUser ? "max-w-[80%]" : "group relative max-w-[80%]"} px-4 py-3 rounded-2xl ${
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
					<>
						<CopyButton text={message.content} />
						<div className="prose-swanson text-sm text-light-text-primary dark:text-dark-text-primary">
							<ReactMarkdown remarkPlugins={[remarkGfm]}>
								{message.content}
							</ReactMarkdown>
							{message.isStreaming && (
								<span className="inline-block w-2 h-4 ml-1 bg-current animate-pulse" />
							)}
						</div>
					</>
				)}
			</div>
		</div>
	)
}
