interface ReadoutProps {
	accent: string;
	label: string;
	value: string;
	floor: string;
	held: boolean;
}

export function Readout({ accent, label, value, floor, held }: ReadoutProps) {
	return (
		<div className="border-b border-border py-3 last:border-b-0">
			<div className="flex items-baseline justify-between gap-3">
				<span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
					{label}
				</span>
				{held && (
					<span
						className="text-[10px] font-mono uppercase tracking-wider"
						style={{ color: `rgb(${accent})` }}
					>
						holding
					</span>
				)}
			</div>
			<div className="flex items-baseline justify-between gap-3 mt-1">
				<span className="text-lg font-mono tracking-tight text-foreground tabular-nums">
					{value}
				</span>
				<span className="text-[11px] font-mono text-muted-foreground">
					{floor}
				</span>
			</div>
		</div>
	);
}
