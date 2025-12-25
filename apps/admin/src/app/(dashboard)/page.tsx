"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { useTRPC } from "@/trpc/react";

import { DemoCountdown } from "./components/DemoCountdown";
import { FunnelChart } from "./components/FunnelChart";
import { LeaderboardTable } from "./components/LeaderboardTable";
import { RetentionCard } from "./components/RetentionCard";
import { RevenueTrendChart } from "./components/RevenueTrendChart";
import { SignupsTrendChart } from "./components/SignupsTrendChart";
import { type TimeRange, TimeRangePicker } from "./components/TimeRangePicker";
import { TrafficSourcesChart } from "./components/TrafficSourcesChart";
import { WAUTrendChart } from "./components/WAUTrendChart";
import { WeekPicker } from "./components/WeekPicker";

export default function DashboardPage() {
	const trpc = useTRPC();

	const [activationFunnelRange, setActivationFunnelRange] =
		useState<TimeRange>("-7d");
	const [marketingFunnelRange, setMarketingFunnelRange] =
		useState<TimeRange>("-7d");
	const [signupsRange, setSignupsRange] = useState<TimeRange>("-30d");
	const [trafficRange, setTrafficRange] = useState<TimeRange>("-30d");
	const [revenueRange, setRevenueRange] = useState<TimeRange>("-30d");
	const [wauRange, setWauRange] = useState<TimeRange>("-30d");
	const [leaderboardWeekOffset, setLeaderboardWeekOffset] = useState(0);

	const activationFunnel = useQuery(
		trpc.analytics.getActivationFunnel.queryOptions({
			dateFrom: activationFunnelRange,
		}),
	);

	const marketingFunnel = useQuery(
		trpc.analytics.getMarketingFunnel.queryOptions({
			dateFrom: marketingFunnelRange,
		}),
	);

	const wau = useQuery(
		trpc.analytics.getWAUTrend.queryOptions({
			days: Number.parseInt(wauRange.slice(1, -1), 10),
		}),
	);

	const retention = useQuery(trpc.analytics.getRetention.queryOptions());

	const leaderboard = useQuery(
		trpc.analytics.getWorkspacesLeaderboard.queryOptions({
			weekOffset: leaderboardWeekOffset,
		}),
	);

	const signups = useQuery(
		trpc.analytics.getSignupsTrend.queryOptions({
			days: Number.parseInt(signupsRange.slice(1, -1), 10),
		}),
	);

	const trafficSources = useQuery(
		trpc.analytics.getTrafficSources.queryOptions({
			days: Number.parseInt(trafficRange.slice(1, -1), 10),
		}),
	);

	const revenue = useQuery(
		trpc.analytics.getRevenueTrend.queryOptions({
			days: Number.parseInt(revenueRange.slice(1, -1), 10),
		}),
	);

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-bold">Overview</h1>
					<p className="text-muted-foreground">Company metrics & insights</p>
				</div>
				<DemoCountdown />
			</div>

			<WAUTrendChart
				data={wau.data}
				isLoading={wau.isLoading}
				error={wau.error}
				headerAction={
					<TimeRangePicker value={wauRange} onChange={setWauRange} />
				}
			/>

			<RevenueTrendChart
				data={revenue.data}
				isLoading={revenue.isLoading}
				error={revenue.error}
				headerAction={
					<TimeRangePicker value={revenueRange} onChange={setRevenueRange} />
				}
			/>

			<SignupsTrendChart
				data={signups.data}
				isLoading={signups.isLoading}
				error={signups.error}
				headerAction={
					<TimeRangePicker value={signupsRange} onChange={setSignupsRange} />
				}
			/>

			<RetentionCard
				data={retention.data}
				isLoading={retention.isLoading}
				error={retention.error}
			/>

			<FunnelChart
				title="Activation Funnel"
				description="From app open to workspace creation"
				data={activationFunnel.data}
				isLoading={activationFunnel.isLoading}
				error={activationFunnel.error}
				headerAction={
					<TimeRangePicker
						value={activationFunnelRange}
						onChange={setActivationFunnelRange}
					/>
				}
			/>

			<FunnelChart
				title="Marketing Funnel"
				description="From site visit to app download"
				data={marketingFunnel.data}
				isLoading={marketingFunnel.isLoading}
				error={marketingFunnel.error}
				headerAction={
					<TimeRangePicker
						value={marketingFunnelRange}
						onChange={setMarketingFunnelRange}
					/>
				}
			/>

			<LeaderboardTable
				title="Workspace Leaderboard"
				description="Top users by workspaces created"
				data={leaderboard.data}
				isLoading={leaderboard.isLoading}
				error={leaderboard.error}
				countLabel="Workspaces"
				headerAction={
					<WeekPicker
						weekOffset={leaderboardWeekOffset}
						onChange={setLeaderboardWeekOffset}
					/>
				}
			/>

			<TrafficSourcesChart
				data={trafficSources.data}
				isLoading={trafficSources.isLoading}
				error={trafficSources.error}
				headerAction={
					<TimeRangePicker value={trafficRange} onChange={setTrafficRange} />
				}
			/>
		</div>
	);
}
