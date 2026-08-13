import { useMemo } from "react";

const DAY_MS = 24 * 60 * 60 * 1000;
/** Single-series magnitude → bars, one hue (emerald = "done"; validated). */
const BAR_COLOR = "#059669";

interface DeliveryFlowChartProps {
	/** ISO day (YYYY-MM-DD) → completions. */
	dailyDone: Record<string, number>;
}

export function DeliveryFlowChart({ dailyDone }: DeliveryFlowChartProps) {
	const days = useMemo(() => {
		const list: Array<{ day: string; count: number }> = [];
		for (let i = 29; i >= 0; i--) {
			const day = new Date(Date.now() - i * DAY_MS).toISOString().slice(0, 10);
			list.push({ day, count: dailyDone[day] ?? 0 });
		}
		return list;
	}, [dailyDone]);
	const max = Math.max(1, ...days.map((d) => d.count));
	const total = days.reduce((sum, d) => sum + d.count, 0);

	return (
		<div className="flex flex-col gap-1.5">
			<div className="flex items-baseline gap-2">
				<span className="text-xs font-medium text-muted-foreground">
					Delivery flow
				</span>
				<span className="text-[11px] text-muted-foreground/70">
					items done per day · 30d
				</span>
			</div>
			{total === 0 ? (
				<p className="py-4 text-xs text-muted-foreground">
					No completions in the last 30 days.
				</p>
			) : (
				<div className="flex h-20 items-end gap-0.5">
					{days.map(({ day, count }) => (
						<div
							key={day}
							title={`${day}: ${count} done`}
							className="group flex h-full flex-1 items-end"
						>
							<div
								className="w-full rounded-t-[4px] transition-opacity group-hover:opacity-80"
								style={{
									backgroundColor: count > 0 ? BAR_COLOR : "transparent",
									// Zero days keep a 2px baseline tick so the axis reads.
									height: count > 0 ? `${(count / max) * 100}%` : "2px",
									...(count === 0 ? { backgroundColor: "var(--border)" } : {}),
								}}
							/>
						</div>
					))}
				</div>
			)}
		</div>
	);
}
