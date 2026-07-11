import { cn } from "@superset/ui/utils";

const RADIUS = 6.5;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
/** Arc length shown while spinning without a known percent */
const INDETERMINATE_PERCENT = 25;

interface DownloadRingProps {
	/** 0-100, or null when the download hasn't reported progress yet */
	percent: number | null;
	/** Size override, e.g. "size-3" (defaults to size-4) */
	className?: string;
}

export function DownloadRing({ percent, className }: DownloadRingProps) {
	const isIndeterminate = percent === null;
	const shownPercent = isIndeterminate ? INDETERMINATE_PERCENT : percent;

	return (
		<svg
			viewBox="0 0 17 17"
			className={cn(
				"shrink-0 -rotate-90",
				isIndeterminate && "animate-spin",
				className ?? "size-4",
			)}
			aria-hidden="true"
		>
			<circle
				cx="8.5"
				cy="8.5"
				r={RADIUS}
				fill="none"
				strokeWidth="2"
				className="stroke-foreground/15"
			/>
			<circle
				cx="8.5"
				cy="8.5"
				r={RADIUS}
				fill="none"
				strokeWidth="2"
				strokeLinecap="round"
				strokeDasharray={CIRCUMFERENCE}
				strokeDashoffset={CIRCUMFERENCE * (1 - shownPercent / 100)}
				className="stroke-foreground/80 transition-[stroke-dashoffset] duration-300"
			/>
		</svg>
	);
}
