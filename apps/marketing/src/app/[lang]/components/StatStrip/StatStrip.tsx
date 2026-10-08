interface Stat {
	label: string;
	value: string;
	hint?: string;
}

export function StatStrip({
	stats,
	loading = false,
}: {
	stats: Stat[];
	loading?: boolean;
}) {
	return (
		<dl
			aria-busy={loading}
			className={`grid grid-cols-2 overflow-hidden rounded-[2px] border border-border bg-background sm:grid-cols-4 ${loading ? "opacity-50" : ""}`}
		>
			{stats.map((stat) => (
				<div
					key={stat.label}
					className="border-border p-4 odd:border-r max-sm:nth-[-n+2]:border-b sm:border-r sm:last:border-r-0 sm:p-5"
				>
					<dt className="text-xs text-muted-foreground">{stat.label}</dt>
					<dd className="mt-2 text-2xl font-medium tracking-tight text-foreground tabular-nums">
						{stat.value}
					</dd>
					{stat.hint && (
						<dd className="mt-1 text-xs text-muted-foreground">{stat.hint}</dd>
					)}
				</div>
			))}
		</dl>
	);
}
