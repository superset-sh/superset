"use client";

import { useLingui } from "@lingui/react/macro";
import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@superset/ui/chart";
import { useQuery } from "@tanstack/react-query";
import {
	Bar,
	ComposedChart,
	Line,
	ReferenceLine,
	XAxis,
	YAxis,
} from "recharts";

import { useTRPC } from "@/trpc/react";

import { makeDateAxis } from "../../utils/chartAxis";
import { InsightTileFrame } from "../InsightTileFrame";

const WEEKS = 12;

export function ProOrgsTile() {
	const { t } = useLingui();
	const trpc = useTRPC();
	const query = useQuery(
		trpc.business.getProOrgs.queryOptions({ weeks: WEEKS }),
	);

	const chartConfig = {
		pro_orgs: {
			label: t({ message: "Pro organizations" }),
			color: "var(--chart-1)",
		},
		new_pro_orgs: {
			label: t({ message: "new" }),
			color: "var(--chart-2)",
		},
		// Plotted below the axis so the two bars read as one net movement.
		churned_pro_orgs: {
			label: t({ message: "churned" }),
			color: "var(--chart-4)",
		},
	} satisfies ChartConfig;

	const data = (query.data ?? []).map((row) => ({
		week: row.week,
		pro_orgs: row.pro_orgs,
		new_pro_orgs: row.new_pro_orgs,
		churned_pro_orgs: -row.churned_pro_orgs,
	}));
	const xAxis = makeDateAxis(data.map((row) => row.week));
	// The movement bars get their own axis so a 40-organization week is not
	// drawn against a 700-organization scale. Its domain is set from the data
	// rather than left to auto so the bars stay a band along the bottom
	// instead of filling the plot and reading as the headline.
	const movementMax = Math.max(
		1,
		...data.map((row) => Math.max(row.new_pro_orgs, -row.churned_pro_orgs)),
	);

	return (
		<InsightTileFrame
			title={t({ message: "Pro organizations" })}
			description={t({
				message:
					"Organizations on a paid Pro plan at each week's end (Neon), with the ones gained and lost that week. Enterprise has its own tile; the current week is still filling.",
			})}
			isLoading={query.isLoading}
			error={query.error}
			empty={data.length === 0}
		>
			<ChartContainer config={chartConfig} className="h-[240px] w-full">
				{/* One shared axis: a hidden second axis would rescale a 40-org
				    week to the full height of a 700-org chart. */}
				<ComposedChart data={data} stackOffset="sign">
					<XAxis
						dataKey="week"
						tickLine={false}
						axisLine={false}
						fontSize={11}
						ticks={xAxis.ticks}
						tickFormatter={xAxis.tickFormatter}
					/>
					<YAxis
						yAxisId="level"
						tickLine={false}
						axisLine={false}
						width={44}
						fontSize={11}
						// A count of paying organizations is a level, not a quantity
						// measured from zero: anchoring the axis at 0 flattens the
						// week-to-week movement that the tile exists to show.
						domain={[
							(min: number) => Math.floor(min * 0.97),
							(max: number) => Math.ceil(max * 1.03),
						]}
					/>
					<YAxis
						yAxisId="movement"
						orientation="right"
						hide
						domain={[-movementMax * 1.3, movementMax * 3.5]}
					/>
					<ChartTooltip content={<ChartTooltipContent />} />
					<ReferenceLine yAxisId="movement" y={0} stroke="var(--border)" />
					<Bar
						dataKey="new_pro_orgs"
						yAxisId="movement"
						stackId="movement"
						fill="var(--color-new_pro_orgs)"
						opacity={0.7}
						radius={2}
					/>
					<Bar
						dataKey="churned_pro_orgs"
						yAxisId="movement"
						stackId="movement"
						fill="var(--color-churned_pro_orgs)"
						opacity={0.7}
						radius={2}
					/>
					<Line
						dataKey="pro_orgs"
						yAxisId="level"
						stroke="var(--color-pro_orgs)"
						strokeWidth={2}
						dot={false}
						type="monotone"
					/>
				</ComposedChart>
			</ChartContainer>
		</InsightTileFrame>
	);
}
