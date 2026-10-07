import { Trans } from "@lingui/react/macro";
import {
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@superset/ui/chart";
import { cn } from "@superset/ui/utils";
import { useMemo } from "react";
import { Area, AreaChart, XAxis, YAxis } from "recharts";
import { formatResourceSampleTime } from "./utils/formatResourceSampleTime/formatResourceSampleTime";

interface ResourceSparklineProps<Sample extends { at: number }> {
	label: string;
	/** Formatted current value shown in the card header. */
	current: string;
	/** CSS color for the area stroke/fill. */
	color: string;
	samples: Sample[];
	getValue: (sample: Sample) => number;
	formatValue: (value: number) => string;
	compact?: boolean;
}

/** Small live area chart over the rolling sample buffer (~5 min window). */
export function ResourceSparkline<Sample extends { at: number }>({
	label,
	current,
	color,
	samples,
	getValue,
	formatValue,
	compact,
}: ResourceSparklineProps<Sample>) {
	const data = useMemo(
		() => samples.map((sample) => ({ at: sample.at, value: getValue(sample) })),
		[samples, getValue],
	);

	return (
		<div className={cn("rounded-lg border", compact ? "p-2" : "p-3")}>
			<div className="flex items-baseline justify-between">
				<span className="text-[10px] text-muted-foreground">{label}</span>
				<span
					className={cn(
						"font-medium tabular-nums",
						compact ? "text-xs" : "text-sm",
					)}
				>
					{current}
				</span>
			</div>
			{data.length < 2 ? (
				<div
					className={cn(
						"flex items-center justify-center text-[10px] text-muted-foreground",
						compact ? "h-8" : "h-16",
					)}
				>
					<Trans>Collecting…</Trans>
				</div>
			) : (
				<ChartContainer
					config={{ value: { label, color } }}
					className={cn("mt-1 aspect-auto w-full", compact ? "h-8" : "h-16")}
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
									labelFormatter={formatResourceSampleTime}
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
