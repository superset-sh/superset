"use client";

import { useLingui } from "@lingui/react/macro";
import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@superset/ui/chart";
import { useQuery } from "@tanstack/react-query";
import { Bar, ComposedChart, Line, XAxis, YAxis } from "recharts";

import { useTRPC } from "@/trpc/react";

import { makeDateAxis } from "../../utils/chartAxis";
import { InsightTileFrame } from "../InsightTileFrame";

const WEEKS = 12;

export function OrgAdoptionTile() {
	const { t } = useLingui();
	const trpc = useTRPC();
	const query = useQuery(
		trpc.business.getOrgAdoption.queryOptions({ weeks: WEEKS }),
	);

	const chartConfig = {
		teams_per_1000: {
			label: t({ message: "teams per 1,000 organizations" }),
			color: "var(--chart-1)",
		},
		teams: {
			label: t({ message: "teams" }),
			color: "var(--chart-2)",
		},
	} satisfies ChartConfig;

	const data = query.data ?? [];
	const xAxis = makeDateAxis(data.map((row) => row.week));

	return (
		<InsightTileFrame
			title={t({ message: "Teams vs individual accounts (Neon)" })}
			// Two lines, like every other tile: a longer description pushes this
			// card's chart below its neighbour's in the same row.
			description={t({
				message:
					"Organizations with a second member vs single-member accounts; the line is teams per 1,000.",
			})}
			fill
			isLoading={query.isLoading}
			error={query.error}
			empty={data.length === 0}
		>
			<ChartContainer
				config={chartConfig}
				className="aspect-auto h-full min-h-[220px] w-full"
			>
				<ComposedChart data={data}>
					<XAxis
						dataKey="week"
						tickLine={false}
						axisLine={false}
						fontSize={11}
						ticks={xAxis.ticks}
						tickFormatter={xAxis.tickFormatter}
					/>
					{/* The ratio leads, so it takes the labelled axis; team counts
					    ride along on their own scale rather than being flattened
					    against 60,000 accounts. */}
					<YAxis
						yAxisId="ratio"
						tickLine={false}
						axisLine={false}
						width={44}
						fontSize={11}
						domain={[
							(min: number) => Math.max(0, Math.floor((min - 0.2) * 10) / 10),
							(max: number) => Math.ceil((max + 0.2) * 10) / 10,
						]}
					/>
					<YAxis
						yAxisId="teams"
						orientation="right"
						hide
						domain={[0, (max: number) => Math.ceil(max * 2.5)]}
					/>
					<ChartTooltip content={<ChartTooltipContent />} />
					<Bar
						dataKey="teams"
						yAxisId="teams"
						fill="var(--color-teams)"
						opacity={0.35}
						radius={2}
					/>
					<Line
						dataKey="teams_per_1000"
						yAxisId="ratio"
						stroke="var(--color-teams_per_1000)"
						strokeWidth={2}
						dot={false}
						type="monotone"
					/>
				</ComposedChart>
			</ChartContainer>
		</InsightTileFrame>
	);
}
