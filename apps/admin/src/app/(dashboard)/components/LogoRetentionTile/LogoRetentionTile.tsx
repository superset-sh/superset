"use client";

import { useLingui } from "@lingui/react/macro";
import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@superset/ui/chart";
import { useQuery } from "@tanstack/react-query";
import { Line, LineChart, XAxis, YAxis } from "recharts";

import { useTRPC } from "@/trpc/react";

import { formatMonth } from "../../utils/chartAxis";
import { InsightTileFrame } from "../InsightTileFrame";

export function LogoRetentionTile() {
	const { t } = useLingui();
	const trpc = useTRPC();
	const chartConfig = {
		retention_pct: {
			label: t({
				message: "logo retention",
			}),
			color: "var(--chart-1)",
		},
	} satisfies ChartConfig;
	const query = useQuery(
		trpc.business.getLogoRetention.queryOptions({ months: 8 }),
	);
	const data = query.data ?? [];

	return (
		<InsightTileFrame
			title={t({
				message: "Logo retention — monthly",
			})}
			description={t({
				message:
					"% of subscribed orgs at month end still subscribed one month later (count-based; $ NRR needs a Sigma query)",
			})}
			isLoading={query.isLoading}
			error={query.error}
			empty={data.length === 0}
		>
			<ChartContainer config={chartConfig} className="h-[240px] w-full">
				<LineChart data={data}>
					<XAxis
						dataKey="month"
						tickLine={false}
						axisLine={false}
						fontSize={11}
						tickFormatter={formatMonth}
					/>
					<YAxis
						tickLine={false}
						axisLine={false}
						width={44}
						domain={[0, 100]}
						tickFormatter={(v: number) => `${v}%`}
					/>
					<ChartTooltip content={<ChartTooltipContent />} />
					<Line
						dataKey="retention_pct"
						stroke="var(--color-retention_pct)"
						strokeWidth={2}
						dot={false}
						type="monotone"
					/>
				</LineChart>
			</ChartContainer>
		</InsightTileFrame>
	);
}
