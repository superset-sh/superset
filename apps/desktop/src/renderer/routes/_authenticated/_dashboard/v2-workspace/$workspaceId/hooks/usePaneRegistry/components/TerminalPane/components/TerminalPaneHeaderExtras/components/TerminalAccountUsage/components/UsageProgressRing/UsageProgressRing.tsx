interface UsageProgressRingProps {
	usedPercent?: number;
	unavailable?: boolean;
}

export function UsageProgressRing({
	usedPercent = 0,
	unavailable = false,
}: UsageProgressRingProps) {
	const percent = Number.isFinite(usedPercent)
		? Math.min(100, Math.max(0, usedPercent))
		: 0;
	return (
		<svg aria-hidden="true" viewBox="0 0 16 16" className="size-4" fill="none">
			<circle
				cx="8"
				cy="8"
				r="6"
				stroke="currentColor"
				strokeWidth="1.5"
				opacity={unavailable ? 1 : 0.25}
				strokeDasharray={unavailable ? "2 2" : undefined}
			/>
			{!unavailable && percent > 0 && (
				<circle
					cx="8"
					cy="8"
					r="6"
					stroke="currentColor"
					strokeWidth="1.5"
					pathLength="100"
					strokeDasharray={`${percent} 100`}
					transform="rotate(-90 8 8)"
				/>
			)}
		</svg>
	);
}
