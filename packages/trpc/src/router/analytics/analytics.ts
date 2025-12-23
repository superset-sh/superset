import { db } from "@superset/db/client";
import { users } from "@superset/db/schema";
import type { TRPCRouterRecord } from "@trpc/server";
import { inArray } from "drizzle-orm";
import { z } from "zod";

import {
	executeFunnelQuery,
	executeHogQLQuery,
	executeQuery,
	executeRetentionQuery,
	type FunnelResult,
	type InsightVizNode,
	type RetentionCohort,
} from "../../lib/posthog-client";
import { adminProcedure } from "../../trpc";

export interface FunnelStepData {
	name: string;
	count: number;
	conversionRate: number;
}

export interface LeaderboardEntry {
	userId: string;
	name: string;
	email: string;
	avatarUrl: string | null;
	count: number;
}

function formatFunnelResults(results: FunnelResult[]): FunnelStepData[] {
	if (!results.length) return [];

	const firstStepCount = results[0]?.count ?? 0;

	return results.map((step) => ({
		name: step.custom_name ?? step.name,
		count: step.count,
		conversionRate:
			firstStepCount > 0 ? (step.count / firstStepCount) * 100 : 0,
	}));
}

function formatWeekData(
	weekValue: { count: number } | undefined,
	week0Count: number,
): { count: number; rate: number | null } {
	const count = weekValue?.count ?? 0;
	return {
		count,
		rate: week0Count > 0 ? (count / week0Count) * 100 : null,
	};
}

export const analyticsRouter = {
	getFullJourneyFunnel: adminProcedure
		.input(
			z
				.object({
					dateFrom: z.string().optional().default("-7d"),
				})
				.optional(),
		)
		.query(async ({ input }) => {
			const dateFrom = input?.dateFrom ?? "-7d";

			const results = await executeFunnelQuery(
				[
					{ kind: "EventsNode", event: "$pageview", name: "Site Visit" },
					{
						kind: "EventsNode",
						event: "download_clicked",
						name: "Download Clicked",
					},
					{
						kind: "EventsNode",
						event: "desktop_opened",
						name: "Desktop Opened",
					},
					{
						kind: "EventsNode",
						event: "auth_completed",
						name: "Auth Completed",
					},
					{
						kind: "EventsNode",
						event: "terminal_opened",
						name: "Terminal Opened",
					},
				],
				dateFrom,
			);

			return formatFunnelResults(results);
		}),

	getWAUTrend: adminProcedure
		.input(
			z
				.object({
					days: z.number().min(7).max(180).optional().default(30),
				})
				.optional(),
		)
		.query(async ({ input }) => {
			const days = input?.days ?? 30;
			const numWeeks = Math.ceil(days / 7);

			// Calculate WAU for each week
			const weeklyData: { week: string; count: number }[] = [];

			for (let i = numWeeks - 1; i >= 0; i--) {
				const weekEnd = i * 7;
				const weekStart = weekEnd + 7;

				// Only count workspace_created as meaningful product usage
				const { results } = await executeHogQLQuery<[[number]]>(`
					SELECT count(DISTINCT person_id) as wau_users
					FROM (
						SELECT person_id, count(DISTINCT toDate(timestamp)) as active_days
						FROM events
						WHERE timestamp >= now() - INTERVAL ${weekStart} DAY
							AND timestamp < now() - INTERVAL ${weekEnd} DAY
							AND event = 'workspace_created'
						GROUP BY person_id
						HAVING active_days >= 3
					)
				`);

				// Calculate the week's start date for the label
				const weekDate = new Date();
				weekDate.setDate(weekDate.getDate() - weekStart);
				const weekLabel = weekDate.toISOString().split("T")[0] as string;

				weeklyData.push({
					week: weekLabel,
					count: results[0]?.[0] ?? 0,
				});
			}

			return weeklyData;
		}),

	getRetention: adminProcedure.query(async () => {
		// Weekly cohort retention: users who auth'd and returned (any event)
		const cohorts = await executeRetentionQuery({
			targetEvent: "auth_completed",
			returningEvent: "$pageview", // Any activity counts as returning
			period: "Week",
			totalIntervals: 5,
			dateFrom: "-35d",
		});

		return cohorts.map((cohort: RetentionCohort) => {
			const week0Count = cohort.values[0]?.count ?? 0;

			return {
				cohort: new Date(cohort.date).toLocaleDateString("en-US", {
					month: "short",
					day: "numeric",
				}),
				week0: { count: week0Count, rate: 100 },
				week1: formatWeekData(cohort.values[1], week0Count),
				week2: formatWeekData(cohort.values[2], week0Count),
				week3: formatWeekData(cohort.values[3], week0Count),
				week4: formatWeekData(cohort.values[4], week0Count),
			};
		});
	}),

	getWorkspacesLeaderboard: adminProcedure
		.input(
			z
				.object({
					limit: z.number().min(1).max(50).optional().default(10),
					weekOffset: z.number().min(-52).max(0).optional().default(0),
				})
				.optional(),
		)
		.query(async ({ input }) => {
			const limit = input?.limit ?? 10;
			const weekOffset = input?.weekOffset ?? 0;
			const weekStart = weekOffset === 0 ? 0 : -weekOffset * 7;

			const { results } = await executeHogQLQuery<[string, number][]>(`
				SELECT
					distinct_id,
					count() as workspaces_created
				FROM events
				WHERE event = 'workspace_created'
					AND timestamp >= now() - INTERVAL ${weekStart + 7} DAY
					AND timestamp < now() - INTERVAL ${weekStart} DAY
				GROUP BY distinct_id
				ORDER BY workspaces_created DESC
				LIMIT ${limit}
			`);

			if (!results.length) {
				return [] as LeaderboardEntry[];
			}

			// Extract user IDs from PostHog results
			const userIds = results.map(([distinctId]) => distinctId);

			// Fetch user details from our database
			const dbUsers = await db.query.users.findMany({
				where: inArray(users.id, userIds),
			});

			const userMap = new Map(dbUsers.map((u) => [u.id, u]));

			// Join PostHog data with DB user data
			const leaderboard: LeaderboardEntry[] = results
				.map(([distinctId, count]) => {
					const user = userMap.get(distinctId);
					if (!user) return null;

					return {
						userId: user.id,
						name: user.name,
						email: user.email,
						avatarUrl: user.avatarUrl,
						count,
					};
				})
				.filter((entry): entry is LeaderboardEntry => entry !== null);

			return leaderboard;
		}),
	getSignupsTrend: adminProcedure
		.input(
			z
				.object({
					days: z.number().min(7).max(180).optional().default(30),
				})
				.optional(),
		)
		.query(async ({ input }) => {
			const days = input?.days ?? 30;

			const { results } = await executeHogQLQuery<[string, number][]>(`
				SELECT
					formatDateTime(toDate(timestamp), '%Y-%m-%d') as date,
					count(DISTINCT person_id) as signups
				FROM events
				WHERE event = 'auth_completed'
					AND timestamp >= now() - INTERVAL ${days} DAY
				GROUP BY date
				ORDER BY date ASC
			`);

			// Create a map of existing data
			const dataMap = new Map(results.map(([date, count]) => [date, count]));

			// Fill in all dates in the range
			const filledData: { date: string; count: number }[] = [];
			const now = new Date();
			for (let i = days - 1; i >= 0; i--) {
				const date = new Date(now);
				date.setDate(date.getDate() - i);
				const dateStr = date.toISOString().split("T")[0] as string;
				filledData.push({
					date: dateStr,
					count: dataMap.get(dateStr) ?? 0,
				});
			}

			return filledData;
		}),

	getTrafficSources: adminProcedure
		.input(
			z
				.object({
					days: z.number().min(7).max(180).optional().default(30),
				})
				.optional(),
		)
		.query(async ({ input }) => {
			const days = input?.days ?? 30;

			// Use TrendsQuery with breakdown for more reliable results
			const query: InsightVizNode = {
				kind: "InsightVizNode",
				source: {
					kind: "TrendsQuery",
					series: [
						{
							kind: "EventsNode",
							event: "$pageview",
							math: "dau",
						},
					],
					dateRange: { date_from: `-${days}d` },
					breakdownFilter: {
						breakdown: "$referring_domain",
						breakdown_type: "event",
					},
				},
			};

			interface BreakdownResult {
				breakdown_value: string;
				count: number;
				label: string;
			}

			const result = await executeQuery<BreakdownResult[]>(query);

			return result.results
				.map((r) => ({
					source: r.label || r.breakdown_value || "$direct",
					count: r.count,
				}))
				.sort((a, b) => b.count - a.count)
				.slice(0, 10);
		}),

	getRevenueTrend: adminProcedure
		.input(
			z
				.object({
					days: z.number().min(7).max(180).optional().default(30),
				})
				.optional(),
		)
		.query(async ({ input }) => {
			const days = input?.days ?? 30;

			// Fill in all dates in the range with zeros (no revenue tracking yet)
			const filledData: { date: string; revenue: number; mrr: number }[] = [];
			const now = new Date();

			for (let i = days - 1; i >= 0; i--) {
				const date = new Date(now);
				date.setDate(date.getDate() - i);
				const dateStr = date.toISOString().split("T")[0] as string;
				filledData.push({
					date: dateStr,
					revenue: 0,
					mrr: 0,
				});
			}

			return filledData;
		}),
} satisfies TRPCRouterRecord;
