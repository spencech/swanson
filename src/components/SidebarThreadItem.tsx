import { useState } from 'react'
import type { IThreadSummary } from '../../shared/types'

interface SidebarThreadItemProps {
	thread: IThreadSummary
	isActive: boolean
	onClick: () => void
	onDelete: () => void
	onRename: (title: string) => void
}

export function SidebarThreadItem({ thread, isActive, onClick, onDelete, onRename }: SidebarThreadItemProps) {
	const [isEditing, setIsEditing] = useState(false)
	const [editTitle, setEditTitle] = useState(thread.title)

	const handleRename = () => {
		const trimmed = editTitle.trim()
		if (trimmed && trimmed !== thread.title) {
			onRename(trimmed)
		} else {
			setEditTitle(thread.title)
		}
		setIsEditing(false)
	}

	const timeAgo = formatTimeAgo(thread.updatedAt)

	return (
		<div
			className={`group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
				isActive
					? "bg-light-accent/10 dark:bg-dark-accent/10 text-light-accent dark:text-dark-accent"
					: "hover:bg-light-surface dark:hover:bg-dark-surface text-light-text-primary dark:text-dark-text-primary"
			}`}
			onClick={onClick}
		>
			<div className="flex-1 min-w-0">
				{isEditing ? (
					<input
						value={editTitle}
						onChange={(e) => setEditTitle(e.target.value)}
						onBlur={handleRename}
						onKeyDown={(e) => {
							if (e.key === "Enter") handleRename()
							if (e.key === "Escape") { setEditTitle(thread.title); setIsEditing(false) }
						}}
						className="w-full text-sm bg-transparent border-b border-light-accent dark:border-dark-accent outline-none"
						autoFocus
						onClick={(e) => e.stopPropagation()}
					/>
				) : (
					<div className="text-sm font-medium truncate">{thread.title}</div>
				)}
				<div className="text-xs text-light-text-secondary dark:text-dark-text-secondary truncate">
					{thread.messagePreview || timeAgo}
				</div>
			</div>

			{/* Actions (visible on hover) */}
			<div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
				<button
					onClick={(e) => { e.stopPropagation(); setIsEditing(true); setEditTitle(thread.title) }}
					className="p-1 rounded hover:bg-light-border dark:hover:bg-dark-border transition-colors"
					title="Rename"
				>
					<svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
					</svg>
				</button>
				<button
					onClick={(e) => { e.stopPropagation(); onDelete() }}
					className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500 transition-colors"
					title="Delete"
				>
					<svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
					</svg>
				</button>
			</div>
		</div>
	)
}

function formatTimeAgo(dateStr: string): string {
	const now = Date.now()
	const then = new Date(dateStr).getTime()
	const diff = now - then
	const minutes = Math.floor(diff / 60000)
	if (minutes < 1) return "just now"
	if (minutes < 60) return `${minutes}m ago`
	const hours = Math.floor(minutes / 60)
	if (hours < 24) return `${hours}h ago`
	const days = Math.floor(hours / 24)
	if (days < 7) return `${days}d ago`
	return new Date(dateStr).toLocaleDateString()
}
