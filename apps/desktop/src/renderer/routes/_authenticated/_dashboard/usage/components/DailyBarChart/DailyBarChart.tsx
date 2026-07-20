import type { CostStatsData } from "../../types";

interface DailyBarChartProps {
	buckets: CostStatsData["dailyBuckets"];
}

const CHART_HEIGHT = 48;
const MIN_BAR_HEIGHT = 2;

export function DailyBarChart({ buckets }: DailyBarChartProps) {
	const max = buckets.reduce((acc, b) => Math.max(acc, b.tokens), 0);

	return (
		<div
			className="flex items-end gap-px"
			style={{ height: CHART_HEIGHT }}
			aria-hidden
		>
			{buckets.map((bucket) => {
				const height =
					max > 0
						? Math.max(MIN_BAR_HEIGHT, (bucket.tokens / max) * CHART_HEIGHT)
						: MIN_BAR_HEIGHT;
				return (
					<div
						key={bucket.date}
						className="flex-1 rounded-sm bg-muted-foreground/40"
						style={{ height }}
					/>
				);
			})}
		</div>
	);
}
