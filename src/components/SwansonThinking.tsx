import { useState, useEffect, useCallback, useRef } from "react"
import quotes from "../../assets/ron-swanson-quotes.json"

function pickRandom(exclude: number): number {
	if (quotes.length <= 1) return 0
	let next: number
	do {
		next = Math.floor(Math.random() * quotes.length)
	} while (next === exclude)
	return next
}

const ROTATE_INTERVAL = 6000

export function SwansonThinking() {
	const [index, setIndex] = useState(() => Math.floor(Math.random() * quotes.length))
	const [fading, setFading] = useState(false)
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

	const rotate = useCallback(() => {
		setFading(true)
		timerRef.current = setTimeout(() => {
			setIndex((prev) => pickRandom(prev))
			setFading(false)
		}, 400)
	}, [])

	useEffect(() => {
		const interval = setInterval(rotate, ROTATE_INTERVAL)
		return () => {
			clearInterval(interval)
			if (timerRef.current) clearTimeout(timerRef.current)
		}
	}, [rotate])

	return (
		<div className="flex justify-start">
			<div className="bg-light-surface dark:bg-dark-surface px-4 py-3 rounded-2xl rounded-bl-md max-w-[80%]">
				<p className="text-xs text-light-text-secondary dark:text-dark-text-secondary mb-2">
					Swanson is working on your request. In the meantime, here are some Swanson thoughts to consider:
				</p>
				<div className="flex items-start gap-2.5">
					{/* Pulsing dot — signals activity */}
					<div className="mt-1.5 shrink-0 w-2 h-2 rounded-full bg-light-accent dark:bg-dark-accent animate-pulse" />
					<p
						className={`text-sm italic leading-relaxed text-light-text-secondary dark:text-dark-text-secondary transition-opacity duration-400 ${
							fading ? "opacity-0" : "opacity-100"
						}`}
					>
						&ldquo;{quotes[index]}&rdquo;
					</p>
				</div>
			</div>
		</div>
	)
}
