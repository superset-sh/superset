"use client";

import { useQuery } from "@tanstack/react-query";

import { useTRPC } from "@/trpc/react";

import { ActivationFunnel } from "./components/ActivationFunnel";
import { StatsCard } from "./components/StatsCard";
import { UserEventsTable } from "./components/UserEventsTable";

export default function DashboardPage() {
	const trpc = useTRPC();

	const { data: qualityWAU, isLoading: isLoadingWAU } = useQuery(
		trpc.analytics.getQualityWAU.queryOptions(),
	);

	const { data: userStats, isLoading: isLoadingStats } = useQuery(
		trpc.analytics.getUserStats.queryOptions(),
	);

	const {
		data: funnelData,
		isLoading: isLoadingFunnel,
		error: funnelError,
	} = useQuery(trpc.analytics.getActivationFunnel.queryOptions({}));

	const {
		data: eventsData,
		isLoading: isLoadingEvents,
		error: eventsError,
	} = useQuery(trpc.analytics.getRecentUserEvents.queryOptions({ limit: 10 }));

	// Transform funnel data to the format expected by the component
	const funnelSteps = transformFunnelData(funnelData);

	// Transform events data to the format expected by the component
	const events =
		eventsData?.events.map((event) => ({
			id: event.id,
			event: event.event,
			distinctId: event.distinctId,
			timestamp: event.timestamp,
			person: event.person
				? {
						email: event.person.email,
						name: event.person.name,
					}
				: undefined,
		})) ?? [];

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
				<p className="text-muted-foreground">
					Key metrics and user activity overview
				</p>
			</div>

			{/* Stats Cards Row */}
			<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
				<StatsCard
					title="Quality WAU"
					value={qualityWAU?.count ?? 0}
					description="Users with 3+ active days this week"
					isLoading={isLoadingWAU}
				/>
				<StatsCard
					title="Active Today"
					value={userStats?.usersToday ?? 0}
					description="Users active today"
					isLoading={isLoadingStats}
				/>
				<StatsCard
					title="Active (7d)"
					value={userStats?.users7d ?? 0}
					description="Users active in last 7 days"
					isLoading={isLoadingStats}
				/>
				<StatsCard
					title="Active (30d)"
					value={userStats?.users30d ?? 0}
					description="Users active in last 30 days"
					isLoading={isLoadingStats}
				/>
			</div>

			{/* Activation Funnel */}
			<ActivationFunnel
				steps={funnelSteps}
				isLoading={isLoadingFunnel}
				error={funnelError?.message}
			/>

			{/* Recent Activity */}
			<UserEventsTable
				events={events}
				isLoading={isLoadingEvents}
				error={eventsError?.message}
				showViewAll={true}
			/>
		</div>
	);
}

/**
 * Transform PostHog funnel response to component format
 */
function transformFunnelData(
	funnelData: unknown,
): Array<{ name: string; count: number; conversionRate?: number }> {
	if (!funnelData) {
		return [];
	}

	// PostHog funnel response contains results with breakdown steps
	const data = funnelData as {
		results?: Array<{
			count?: number;
			name?: string;
			order?: number;
			conversion_rate?: number;
		}>;
	};

	if (!data.results || !Array.isArray(data.results)) {
		// Return empty default steps
		return [
			{ name: "Signup", count: 0 },
			{ name: "Download", count: 0 },
			{ name: "First Task", count: 0 },
			{ name: "Completed", count: 0 },
		];
	}

	const stepNames = ["Signup", "Download", "First Task", "Completed"];

	return data.results.map((step, index) => ({
		name: stepNames[index] ?? step.name ?? `Step ${index + 1}`,
		count: step.count ?? 0,
		conversionRate:
			index > 0 ? (step.conversion_rate ?? 0) * 100 : undefined,
	}));
}
