import { db } from "@superset/db/client";
import { users } from "@superset/db/schema";
import type { TRPCRouterRecord } from "@trpc/server";
import { inArray } from "drizzle-orm";
import { z } from "zod";

import {
	executeFunnelQuery,
	executeHogQLQuery,
	type FunnelResult,
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

function formatFunnelResults(results: FunnelResult[][]): FunnelStepData[] {
	if (!results.length || !results[0]) return [];

	const steps = results[0];
	const firstStepCount = steps[0]?.count ?? 0;

	return steps.map((step) => ({
		name: step.custom_name ?? step.name,
		count: step.count,
		conversionRate:
			firstStepCount > 0 ? (step.count / firstStepCount) * 100 : 0,
	}));
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
					{ kind: "EventsNode", event: "$identify", name: "Identified" },
					{
						kind: "EventsNode",
						event: "auth_completed",
						name: "Auth Completed",
					},
					{
						kind: "EventsNode",
						event: "workspace_created",
						name: "Workspace Created",
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

	getOnboardingFunnel: adminProcedure
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
						event: "download_clicked",
						name: "Download Clicked",
					},
					{
						kind: "EventsNode",
						event: "desktop_opened",
						name: "Desktop Opened",
					},
					{ kind: "EventsNode", event: "auth_started", name: "Auth Started" },
					{
						kind: "EventsNode",
						event: "auth_completed",
						name: "Auth Completed",
					},
				],
				dateFrom,
			);

			return formatFunnelResults(results);
		}),

	getWeeklyActiveUsers: adminProcedure.query(async () => {
		const { results } = await executeHogQLQuery<[[number]]>(`
			SELECT count(DISTINCT person_id) as wau_users
			FROM (
				SELECT person_id, count(DISTINCT toDate(timestamp)) as active_days
				FROM events
				WHERE timestamp >= now() - INTERVAL 7 DAY
				GROUP BY person_id
				HAVING active_days >= 3
			)
		`);

		const wauCount = results[0]?.[0] ?? 0;
		return { count: wauCount };
	}),

	getWorkspacesLeaderboard: adminProcedure
		.input(
			z
				.object({
					limit: z.number().min(1).max(50).optional().default(10),
				})
				.optional(),
		)
		.query(async ({ input }) => {
			const limit = input?.limit ?? 10;

			const { results } = await executeHogQLQuery<[string, number][]>(`
				SELECT
					distinct_id,
					count() as workspaces_created
				FROM events
				WHERE event = 'workspace_created'
					AND timestamp >= now() - INTERVAL 7 DAY
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
} satisfies TRPCRouterRecord;
