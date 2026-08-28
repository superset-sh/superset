import { formatTokens } from "../../utils/formatUsage";

interface Segment {
	label: string;
	tokens: number;
	color: string;
}

export function TokenSplitBar({
	split,
}: {
	split: {
		uncachedInput: number;
		cachedInput: number;
		cacheWrite5m: number;
		cacheWrite1h: number;
		output: number;
		reasoningOutput: number;
	};
}) {
	const segments: Segment[] = [
		{ label: "Input", tokens: split.uncachedInput, color: "#d25611" },
		{ label: "Output", tokens: split.output, color: "#c19a5b" },
		{ label: "Cache read", tokens: split.cachedInput, color: "#6b8ca3" },
		{
			label: "Cache write",
			tokens: split.cacheWrite5m + split.cacheWrite1h,
			color: "#7a9e7e",
		},
	];

	const total = segments.reduce((sum, segment) => sum + segment.tokens, 0);
	if (total === 0) {
		return (
			<p className="text-sm text-muted-foreground">No usage in this range.</p>
		);
	}

	return (
		<div className="space-y-4">
			{segments.map((segment) => {
				const percent = (segment.tokens / total) * 100;
				return (
					<div key={segment.label}>
						<div className="flex items-baseline justify-between gap-4 mb-1.5">
							<span className="text-sm text-foreground">{segment.label}</span>
							<span className="font-mono text-xs text-muted-foreground">
								{formatTokens(segment.tokens)} · {percent.toFixed(0)}%
							</span>
						</div>
						<div className="h-1.5 bg-foreground/[0.06] rounded-full overflow-hidden">
							<div
								className="h-full"
								style={{
									width: `${Math.max(percent, percent > 0 ? 0.5 : 0)}%`,
									backgroundColor: segment.color,
								}}
							/>
						</div>
					</div>
				);
			})}
		</div>
	);
}
