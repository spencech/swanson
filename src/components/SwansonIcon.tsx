interface SwansonIconProps {
	className?: string
}

export function SwansonIcon({ className = "w-6 h-6" }: SwansonIconProps) {
	return (
		<svg
			className={className}
			viewBox="0 0 64 64"
			fill="currentColor"
			xmlns="http://www.w3.org/2000/svg"
		>
			{/* Handlebar mustache */}
			<path d="M32 18c-4 0-7 1.5-9 3.5C21 23.5 19 24 16.5 23.5c-2.5-.5-4.5-2-5.5-4-.6-1.2.2-1.8 1-.8 1.5 1.8 3.5 3 6 3 2 0 3.8-.8 5.2-2.2C25.5 17.2 28.5 16 32 16s6.5 1.2 8.8 3.5c1.4 1.4 3.2 2.2 5.2 2.2 2.5 0 4.5-1.2 6-3 .8-1 1.6-.4 1-.8-1 2-3 3.5-5.5 4-2.5.5-4.5 0-6.5-2C39 18.5 36 18 32 18z" />
			{/* Glencairn glass - tulip bowl */}
			<path d="M22 30c-.5 6 1 12 3.5 16.5C27.5 50 29.5 52 32 52s4.5-2 6.5-5.5C41 43 42.5 36 42 30H22z" opacity="0.85" />
			{/* Glass rim */}
			<ellipse cx="32" cy="30" rx="11" ry="2.5" opacity="0.95" />
			{/* Stem */}
			<rect x="30" y="52" width="4" height="4" rx="1" />
			{/* Base */}
			<ellipse cx="32" cy="57.5" rx="7" ry="2" />
		</svg>
	)
}
