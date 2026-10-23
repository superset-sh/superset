import { cn } from "@superset/ui/utils";

interface ProgressRingProps {
	percent?: number;
	unavailable?: boolean;
	className?: string;
}

export function ProgressRing({
	percent: rawPercent = 0,
	unavailable = false,
	className,
}: ProgressRingProps) {
	const percent = Number.isFinite(rawPercent)
		? Math.min(100, Math.max(0, rawPercent))
		: 0;
	return (
		<svg
			aria-hidden="true"
			viewBox="0 0 16 16"
			className={cn("size-4 shrink-0", className)}
			fill="none"
		>
			<circle
				cx="8"
				cy="8"
				r="6"
				stroke="currentColor"
				strokeWidth="1.5"
				opacity={unavailable ? 1 : 0.25}
				strokeDasharray={unavailable ? "2 2" : undefined}
			/>
			{!unavailable && (
				<circle
					cx="8"
					cy="8"
					r="6"
					stroke="currentColor"
					strokeWidth="1.5"
					pathLength="100"
					strokeDasharray={`${percent} 100`}
					transform="rotate(-90 8 8)"
					className="transition-[stroke-dasharray] duration-500 ease-out motion-reduce:transition-none"
				/>
			)}
		</svg>
	);
}
