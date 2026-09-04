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

export function SignupToPaidTile() {
	const { t } = useLingui();
	const trpc = useTRPC();
	const chartConfig = {
		conversion_pct: {
			label: t({
				message: "signup → paid ≤30d",
			}),
			color: "var(--chart-1)",
		},
		signups: {
			label: t({ message: "signups" }),
			color: "var(--chart-2)",
		},
	} satisfies ChartConfig;
	const query = useQuery(
		trpc.business.getSignupToPaid.queryOptions({ weeks: 12 }),
	);
	const data = query.data ?? [];
	const xAxis = makeDateAxis(data.map((row) => row.cohort_week));

	return (
		<InsightTileFrame
			title={t({
				message: "Signup → paid within 30d",
			})}
			description={t({
				message:
					"Weekly signup cohorts (Neon); cohorts younger than 30d excluded",
			})}
			isLoading={query.isLoading}
			error={query.error}
			empty={data.length === 0}
		>
			<ChartContainer config={chartConfig} className="h-[240px] w-full">
				<ComposedChart data={data}>
					<XAxis
						dataKey="cohort_week"
						tickLine={false}
						axisLine={false}
						fontSize={11}
						ticks={xAxis.ticks}
						tickFormatter={xAxis.tickFormatter}
					/>
					<YAxis
						yAxisId="left"
						tickLine={false}
						axisLine={false}
						width={44}
						tickFormatter={(v: number) => `${v}%`}
					/>
					<YAxis yAxisId="right" orientation="right" hide />
					<ChartTooltip content={<ChartTooltipContent />} />
					<Bar
						dataKey="signups"
						yAxisId="right"
						fill="var(--color-signups)"
						opacity={0.35}
						radius={2}
					/>
					<Line
						dataKey="conversion_pct"
						yAxisId="left"
						stroke="var(--color-conversion_pct)"
						strokeWidth={2}
						dot={false}
						type="monotone"
					/>
				</ComposedChart>
			</ChartContainer>
		</InsightTileFrame>
	);
}
