"use client";

import { useQuery } from "@tanstack/react-query";

import { useTRPC } from "@/trpc/react";

import { FunnelChart } from "./components/FunnelChart";
import { LeaderboardTable } from "./components/LeaderboardTable";
import { MetricCard } from "./components/MetricCard";

export default function DashboardPage() {
	const trpc = useTRPC();

	const activationFunnel = useQuery(
		trpc.analytics.getActivationFunnel.queryOptions(),
	);

	const onboardingFunnel = useQuery(
		trpc.analytics.getOnboardingFunnel.queryOptions(),
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

			<div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
				<MetricCard
					title="Weekly Active Users"
					description="Users active 3+ days this week"
					value={wau.data?.count}
					isLoading={wau.isLoading}
					error={wau.error}
				/>
				<MetricCard
					title="Activation Rate"
					description="Identify to Terminal Opened"
					value={
						activationFunnel.data && activationFunnel.data.length > 0
							? activationFunnel.data[activationFunnel.data.length - 1]
									?.conversionRate
							: null
					}
					isLoading={activationFunnel.isLoading}
					error={activationFunnel.error}
					formatter={(v) => `${v.toFixed(1)}%`}
				/>
				<MetricCard
					title="Download to Auth"
					description="Marketing conversion rate"
					value={
						onboardingFunnel.data && onboardingFunnel.data.length > 0
							? onboardingFunnel.data[onboardingFunnel.data.length - 1]
									?.conversionRate
							: null
					}
					isLoading={onboardingFunnel.isLoading}
					error={onboardingFunnel.error}
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

			<div className="grid gap-6 lg:grid-cols-2">
				<FunnelChart
					title="Activation Funnel"
					description="User journey from identification to terminal usage"
					data={activationFunnel.data}
					isLoading={activationFunnel.isLoading}
					error={activationFunnel.error}
				/>
				<FunnelChart
					title="Onboarding Funnel"
					description="From marketing site to authenticated user"
					data={onboardingFunnel.data}
					isLoading={onboardingFunnel.isLoading}
					error={onboardingFunnel.error}
				/>
			</div>

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
