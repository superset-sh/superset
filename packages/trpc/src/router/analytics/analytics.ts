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
	getActivationFunnel: adminProcedure
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
					{
						kind: "EventsNode",
						event: "desktop_opened",
						name: "App Opened",
					},
					{
						kind: "EventsNode",
						event: "auth_completed",
						name: "Signed Up",
					},
					{
						kind: "EventsNode",
						event: "project_opened",
						name: "Opened Project",
					},
					{
						kind: "EventsNode",
						event: "workspace_created",
						name: "Created Workspace",
					},
				],
				dateFrom,
			);

			return formatFunnelResults(results);
		}),

	getMarketingFunnel: adminProcedure
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
						name: "App Opened",
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
			const lookbackDays = days + 7;

			const { results } = await executeHogQLQuery<[string, number][]>(`
				SELECT
					report_date as date,
					count(DISTINCT person_id) as wau
				FROM (
					SELECT
						report_date,
						person_id,
						count(DISTINCT activity_date) as active_days
					FROM (
						SELECT toDate(now()) - number as report_date
						FROM numbers(${days})
					) dates
					CROSS JOIN (
						SELECT
							person_id,
							toDate(timestamp) as activity_date
						FROM events
						WHERE event = 'workspace_created'
							AND timestamp >= now() - INTERVAL ${lookbackDays} DAY
					) activities
					WHERE activity_date > report_date - 7
						AND activity_date <= report_date
					GROUP BY report_date, person_id
					HAVING active_days >= 3
				)
				GROUP BY report_date
				ORDER BY report_date ASC
			`);

			const dataMap = new Map(results.map(([date, count]) => [date, count]));
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

	getRetention: adminProcedure.query(async () => {
		const cohorts = await executeRetentionQuery({
			targetEvent: "auth_completed",
			returningEvent: "terminal_opened",
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

			const userIds = results.map(([distinctId]) => distinctId);
			const dbUsers = await db.query.users.findMany({
				where: inArray(users.id, userIds),
			});
			const userMap = new Map(dbUsers.map((u) => [u.id, u]));

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

			const dataMap = new Map(results.map(([date, count]) => [date, count]));
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
