export interface MeterBarProps {
	value: number;
	color: string;
	muted?: boolean;
	className?: string;
}

export function MeterBar({ value, color, muted, className }: MeterBarProps) {
	const filled = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

	return (
		<div
			className={`h-1 w-full overflow-hidden rounded-full bg-foreground/[0.06] ${className ?? ""}`}
		>
			<div
				className="h-full rounded-full transition-[width] duration-200"
				style={{
					width: `${filled > 0 ? Math.max(filled * 100, 1.5) : 0}%`,
					backgroundColor: color,
					opacity: muted ? 0.55 : 1,
				}}
			/>
		</div>
	);
}
