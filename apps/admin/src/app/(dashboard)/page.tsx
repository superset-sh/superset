"use client";

import { useQuery } from "@tanstack/react-query";

import { useTRPC } from "@/trpc/react";

import { FunnelChart } from "./components/FunnelChart";
import { LeaderboardTable } from "./components/LeaderboardTable";
import { MetricCard } from "./components/MetricCard";

export default function DashboardPage() {
	const trpc = useTRPC();

	const fullJourneyFunnel = useQuery(
		trpc.analytics.getFullJourneyFunnel.queryOptions(),
	);

	const wau = useQuery(trpc.analytics.getWeeklyActiveUsers.queryOptions());

	const leaderboard = useQuery(
		trpc.analytics.getWorkspacesLeaderboard.queryOptions(),
	);

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-2xl font-bold">Analytics Dashboard</h1>
				<p className="text-muted-foreground">
					Key product metrics from the last 7 days
				</p>
			</div>

			<div className="grid gap-6 md:grid-cols-3">
				<MetricCard
					title="Weekly Active Users"
					description="Users active 3+ days this week"
					value={wau.data?.count}
					isLoading={wau.isLoading}
					error={wau.error}
				/>
				<MetricCard
					title="Full Journey Conversion"
					description="Site visit to terminal opened"
					value={
						fullJourneyFunnel.data && fullJourneyFunnel.data.length > 0
							? fullJourneyFunnel.data[fullJourneyFunnel.data.length - 1]
									?.conversionRate
							: null
					}
					isLoading={fullJourneyFunnel.isLoading}
					error={fullJourneyFunnel.error}
					formatter={(v) => `${v.toFixed(1)}%`}
				/>
				<MetricCard
					title="Top Creator"
					description="Most workspaces this week"
					value={leaderboard.data?.[0]?.count ?? null}
					isLoading={leaderboard.isLoading}
					error={leaderboard.error}
					formatter={(v) => `${v} workspaces`}
				/>
			</div>

			<FunnelChart
				title="Full Journey Funnel"
				description="From site visit to terminal usage"
				data={fullJourneyFunnel.data}
				isLoading={fullJourneyFunnel.isLoading}
				error={fullJourneyFunnel.error}
			/>

			<LeaderboardTable
				title="Workspace Leaderboard"
				description="Top users by workspaces created this week"
				data={leaderboard.data}
				isLoading={leaderboard.isLoading}
				error={leaderboard.error}
				countLabel="Workspaces"
			/>
		</div>
	);
}
