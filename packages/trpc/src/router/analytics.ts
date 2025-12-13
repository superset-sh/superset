import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod";

import {
	getPersonEvents,
	getPersons,
	getRecentEvents,
	queryPostHog,
} from "../lib/posthog";
import { adminProcedure } from "../trpc";

export const analyticsRouter = {
	/**
	 * Get Quality WAU - users with 3+ active days in the last 7 days
	 */
	getQualityWAU: adminProcedure.query(async () => {
		const result = await queryPostHog({
			kind: "DataVisualizationNode",
			source: {
				kind: "HogQLQuery",
				query: `
					SELECT count(DISTINCT person_id) as quality_wau
					FROM events
					WHERE timestamp >= now() - INTERVAL 7 DAY
					  AND event IN ('task_started', 'task_completed')
					GROUP BY person_id
					HAVING count(DISTINCT toDate(timestamp)) >= 3
				`,
			},
		});

		// Return count or 0 if no results
		const results = result.results as Array<[number]>;
		return {
			count: results.length,
			period: "7d",
		};
	}),

	/**
	 * Get Quality WAU trend over time
	 */
	getQualityWAUTrend: adminProcedure
		.input(
			z.object({
				weeks: z.number().min(1).max(12).default(8),
			}),
		)
		.query(async ({ input }) => {
			const result = await queryPostHog({
				kind: "DataVisualizationNode",
				source: {
					kind: "HogQLQuery",
					query: `
						WITH weekly_active AS (
							SELECT
								person_id,
								toStartOfWeek(timestamp) as week,
								count(DISTINCT toDate(timestamp)) as active_days
							FROM events
							WHERE timestamp >= now() - INTERVAL ${input.weeks} WEEK
							  AND event IN ('task_started', 'task_completed')
							GROUP BY person_id, week
							HAVING active_days >= 3
						)
						SELECT
							week,
							count(DISTINCT person_id) as quality_wau
						FROM weekly_active
						GROUP BY week
						ORDER BY week
					`,
				},
			});

			return {
				data: result.results as Array<[string, number]>,
				weeks: input.weeks,
			};
		}),

	/**
	 * Get activation funnel: Signup → Download → First Task → Completed
	 */
	getActivationFunnel: adminProcedure
		.input(
			z
				.object({
					dateFrom: z.string().optional(),
					dateTo: z.string().optional(),
				})
				.optional(),
		)
		.query(async ({ input }) => {
			const result = await queryPostHog({
				kind: "InsightVizNode",
				source: {
					kind: "FunnelsQuery",
					series: [
						{ kind: "EventsNode", event: "$identify" },
						{ kind: "EventsNode", event: "app_opened" },
						{ kind: "EventsNode", event: "task_started" },
						{ kind: "EventsNode", event: "task_completed" },
					],
					dateRange: {
						date_from: input?.dateFrom ?? "-30d",
						date_to: input?.dateTo,
					},
					funnelsFilter: {
						funnelWindowInterval: 14,
						funnelWindowIntervalUnit: "day",
					},
					filterTestAccounts: true,
				},
			});

			return result;
		}),

	/**
	 * Get week-over-week retention
	 */
	getRetention: adminProcedure
		.input(
			z
				.object({
					cohortWeeks: z.number().min(1).max(12).default(8),
				})
				.optional(),
		)
		.query(async ({ input }) => {
			const weeks = input?.cohortWeeks ?? 8;

			const result = await queryPostHog({
				kind: "DataVisualizationNode",
				source: {
					kind: "HogQLQuery",
					query: `
						WITH
							first_seen AS (
								SELECT
									person_id,
									toStartOfWeek(min(timestamp)) as cohort_week
								FROM events
								WHERE event IN ('task_started', 'task_completed')
								  AND timestamp >= now() - INTERVAL ${weeks} WEEK
								GROUP BY person_id
							),
							weekly_activity AS (
								SELECT
									person_id,
									toStartOfWeek(timestamp) as activity_week
								FROM events
								WHERE event IN ('task_started', 'task_completed')
								  AND timestamp >= now() - INTERVAL ${weeks} WEEK
								GROUP BY person_id, activity_week
							)
						SELECT
							fs.cohort_week,
							dateDiff('week', fs.cohort_week, wa.activity_week) as week_number,
							count(DISTINCT wa.person_id) as users
						FROM first_seen fs
						LEFT JOIN weekly_activity wa ON fs.person_id = wa.person_id
						WHERE wa.activity_week >= fs.cohort_week
						GROUP BY fs.cohort_week, week_number
						ORDER BY fs.cohort_week, week_number
					`,
				},
			});

			return {
				data: result.results as Array<[string, number, number]>,
				cohortWeeks: weeks,
			};
		}),

	/**
	 * Get recent user events for the activity feed
	 */
	getRecentUserEvents: adminProcedure
		.input(
			z
				.object({
					limit: z.number().min(1).max(100).default(50),
				})
				.optional(),
		)
		.query(async ({ input }) => {
			const events = await getRecentEvents({
				limit: input?.limit ?? 50,
			});

			return {
				events: events.results.map((event) => ({
					id: event.id,
					event: event.event,
					distinctId: event.distinct_id,
					timestamp: event.timestamp,
					properties: event.properties,
					person: event.person
						? {
								distinctIds: event.person.distinct_ids,
								email: event.person.properties.email as string | undefined,
								name: event.person.properties.name as string | undefined,
							}
						: undefined,
				})),
			};
		}),

	/**
	 * Get a specific user's events
	 */
	getUserEvents: adminProcedure
		.input(
			z.object({
				personId: z.string(),
				limit: z.number().min(1).max(100).default(50),
				before: z.string().optional(),
			}),
		)
		.query(async ({ input }) => {
			const events = await getPersonEvents(input.personId, {
				limit: input.limit,
				before: input.before,
			});

			return {
				events: events.results.map((event) => ({
					id: event.id,
					event: event.event,
					timestamp: event.timestamp,
					properties: event.properties,
				})),
				hasMore: !!events.next,
			};
		}),

	/**
	 * Search for users/persons
	 */
	searchUsers: adminProcedure
		.input(
			z
				.object({
					search: z.string().optional(),
					limit: z.number().min(1).max(100).default(20),
				})
				.optional(),
		)
		.query(async ({ input }) => {
			const persons = await getPersons({
				limit: input?.limit ?? 20,
				search: input?.search,
			});

			return {
				users: persons.results.map((person) => ({
					id: person.id,
					distinctIds: person.distinct_ids,
					email: person.properties.email as string | undefined,
					name: person.properties.name as string | undefined,
					createdAt: person.created_at,
					properties: person.properties,
				})),
			};
		}),

	/**
	 * Get user stats summary
	 */
	getUserStats: adminProcedure.query(async () => {
		const result = await queryPostHog({
			kind: "DataVisualizationNode",
			source: {
				kind: "HogQLQuery",
				query: `
					SELECT
						count(DISTINCT person_id) as total_users,
						countIf(DISTINCT person_id, timestamp >= now() - INTERVAL 1 DAY) as users_today,
						countIf(DISTINCT person_id, timestamp >= now() - INTERVAL 7 DAY) as users_7d,
						countIf(DISTINCT person_id, timestamp >= now() - INTERVAL 30 DAY) as users_30d
					FROM events
					WHERE event = '$identify'
				`,
			},
		});

		const row = (result.results as Array<[number, number, number, number]>)[0];
		return {
			totalUsers: row?.[0] ?? 0,
			usersToday: row?.[1] ?? 0,
			users7d: row?.[2] ?? 0,
			users30d: row?.[3] ?? 0,
		};
	}),
} satisfies TRPCRouterRecord;
