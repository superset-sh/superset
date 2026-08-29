interface Stat {
	label: string;
	value: string;
	hint?: string;
}

export function StatStrip({
	stats,
	pixelClassName = "",
}: {
	stats: Stat[];
	pixelClassName?: string;
}) {
	return (
		<div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border border border-border">
			{stats.map((stat) => (
				<div key={stat.label} className="bg-background px-4 py-4">
					<div
						className={`text-xl text-brand-light leading-none ${pixelClassName || "font-mono tracking-tight"}`}
					>
						{stat.value}
					</div>
					<div className="font-mono text-[0.65rem] uppercase tracking-[0.12em] text-muted-foreground mt-2">
						{stat.label}
					</div>
					{stat.hint && (
						<div className="text-[0.65rem] text-muted-foreground/70 mt-1">
							{stat.hint}
						</div>
					)}
				</div>
			))}
		</div>
	);
}
