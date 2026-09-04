import { Trans } from "@lingui/react/macro";
import {
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@superset/ui/chart";
import { useMemo } from "react";
import { Area, AreaChart, XAxis, YAxis } from "recharts";
import type { ResourceSample } from "../../hooks/useResourceSampleBuffer";

function formatTime(at: number): string {
	return new Date(at).toLocaleTimeString(undefined, {
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	});
}

interface ResourceSparklineProps {
	label: string;
	/** Formatted current value shown in the card header. */
	current: string;
	/** CSS color for the area stroke/fill. */
	color: string;
	samples: ResourceSample[];
	getValue: (sample: ResourceSample) => number;
	formatValue: (value: number) => string;
}

/** Small live area chart over the rolling sample buffer (~5 min window). */
export function ResourceSparkline({
	label,
	current,
	color,
	samples,
	getValue,
	formatValue,
}: ResourceSparklineProps) {
	const data = useMemo(
		() => samples.map((sample) => ({ at: sample.at, value: getValue(sample) })),
		[samples, getValue],
	);

	return (
		<div className="rounded-lg border p-3">
			<div className="flex items-baseline justify-between">
				<span className="text-[10px] text-muted-foreground">{label}</span>
				<span className="text-sm font-medium tabular-nums">{current}</span>
			</div>
			{data.length < 2 ? (
				<div className="flex h-16 items-center justify-center text-[10px] text-muted-foreground">
					<Trans>Collecting…</Trans>
				</div>
			) : (
				<ChartContainer
					config={{ value: { label, color } }}
					className="mt-1 aspect-auto h-16 w-full"
				>
					<AreaChart
						data={data}
						margin={{ top: 2, right: 0, bottom: 0, left: 0 }}
					>
						<XAxis dataKey="at" hide />
						<YAxis hide domain={[0, "auto"]} />
						<ChartTooltip
							cursor={{ strokeDasharray: "3 3" }}
							content={
								<ChartTooltipContent
									labelFormatter={(value) => formatTime(Number(value))}
									formatter={(value) => (
										<span className="ml-auto font-mono tabular-nums">
											{formatValue(Number(value))}
										</span>
									)}
								/>
							}
						/>
						<Area
							dataKey="value"
							type="monotone"
							stroke="var(--color-value)"
							fill="var(--color-value)"
							strokeWidth={1.5}
							fillOpacity={0.12}
							dot={false}
							isAnimationActive={false}
						/>
					</AreaChart>
				</ChartContainer>
			)}
		</div>
	);
}
