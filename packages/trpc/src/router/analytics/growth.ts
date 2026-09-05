import { db } from "@superset/db/client";
import { members, users } from "@superset/db/schema";
import { COMPANY } from "@superset/shared/constants";
import type { TRPCRouterRecord } from "@trpc/server";
import { and, gte, notLike, type SQL, sql } from "drizzle-orm";
import { z } from "zod";

import { cachedGrowthMetric } from "../../lib/growth/cache";
import { fetchDiscordStats } from "../../lib/growth/discord";
import { fetchGithubStats } from "../../lib/growth/github";
import { fetchSearchConsoleStats } from "../../lib/growth/search-console";
import { fetchContentInventory } from "../../lib/growth/sitemap";
import {
	fetchAiAgents,
	fetchAiReferrals,
	fetchChannelMix,
	fetchConversionEvents,
	fetchLandingSections,
	fetchSearchEngines,
	fetchTopLandingPages,
	fetchTopReferrers,
} from "../../lib/growth/traffic";
import {
	pivotWeekly,
	type WeeklyRow,
	weekStarts,
} from "../../lib/growth/weeks";
import { adminProcedure } from "../../trpc";

// Growth data for the admin Growth page: acquisition and content from PostHog
// sessions, conversion from PostHog events plus Neon, distribution from GitHub
// and Discord, content velocity from the public sitemap, and search from
// Search Console. Every source reads through the shared metric cache.

const WEEKS = 12;
const TOP_DAYS = 30;
const HOGQL_TTL_SECONDS = 10 * 60;

const weekCountInput = z.object({
	weeks: z.number().int().min(4).max(26).default(WEEKS),
});
const dayCountInput = z.object({
	days: z.number().int().min(7).max(182).default(TOP_DAYS),
});

function cachedHogQL<T>(key: string, compute: () => Promise<T>): Promise<T> {
	return cachedGrowthMetric(`hogql:${key}`, HOGQL_TTL_SECONDS, compute);
}

// Weekly counts of rows created since the first week, keyed on the Monday
// that starts each week so they line up with PostHog's toStartOfWeek(x, 1).
async function weeklyCreated(
	table: typeof users,
	weeks: string[],
	extra?: SQL,
): Promise<number[]> {
	const since = new Date(`${weeks[0]}T00:00:00Z`);
	const conditions = [gte(table.createdAt, since)];
	if (extra) conditions.push(extra);
	const rows = await db
		.select({
			week: sql<string>`to_char(date_trunc('week', ${table.createdAt} AT TIME ZONE 'UTC'), 'YYYY-MM-DD')`,
			count: sql<number>`count(*)::int`,
		})
		.from(table)
		.where(and(...conditions))
		.groupBy(sql`1`);
	const pivoted = pivotWeekly(
		rows.map((r): WeeklyRow => [r.week, "created", Number(r.count)]),
		weeks,
	);
	return pivoted.series[0]?.values ?? new Array<number>(weeks.length).fill(0);
}

// Organizations by the week their second member joined: the moment a
// personal organization became a team, whenever it was created.
async function weeklyTeamsFormed(weeks: string[]): Promise<number[]> {
	const since = new Date(`${weeks[0]}T00:00:00Z`);
	const result = await db.execute<{ week: string; count: number }>(sql`
		SELECT to_char(date_trunc('week', second_join AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS week,
			count(*)::int AS count
		FROM (
			SELECT (array_agg(${members.createdAt} ORDER BY ${members.createdAt}))[2] AS second_join
			FROM ${members}
			GROUP BY ${members.organizationId}
			HAVING count(*) >= 2
		) AS teams
		WHERE second_join >= ${since}
		GROUP BY 1
	`);
	const pivoted = pivotWeekly(
		result.rows.map((r): WeeklyRow => [r.week, "teams", Number(r.count)]),
		weeks,
	);
	return pivoted.series[0]?.values ?? new Array<number>(weeks.length).fill(0);
}

export const growthRouter = {
	channelMix: adminProcedure
		.input(weekCountInput)
		.query(({ input }) =>
			cachedHogQL(`channel-mix:${input.weeks}`, () =>
				fetchChannelMix(input.weeks),
			),
		),

	aiReferrals: adminProcedure
		.input(weekCountInput)
		.query(({ input }) =>
			cachedHogQL(`ai-referrals:${input.weeks}`, () =>
				fetchAiReferrals(input.weeks),
			),
		),

	searchEngines: adminProcedure
		.input(weekCountInput)
		.query(({ input }) =>
			cachedHogQL(`search-engines:${input.weeks}`, () =>
				fetchSearchEngines(input.weeks),
			),
		),

	topReferrers: adminProcedure
		.input(dayCountInput)
		.query(({ input }) =>
			cachedHogQL(`top-referrers:${input.days}`, () =>
				fetchTopReferrers(input.days),
			),
		),

	aiAgents: adminProcedure
		.input(dayCountInput)
		.query(({ input }) =>
			cachedHogQL(`ai-agents:${input.days}`, () => fetchAiAgents(input.days)),
		),

	landingSections: adminProcedure
		.input(weekCountInput)
		.query(({ input }) =>
			cachedHogQL(`landing-sections:${input.weeks}`, () =>
				fetchLandingSections(input.weeks),
			),
		),

	topLandingPages: adminProcedure
		.input(
			z.object({
				scope: z.enum(["compare", "blog", "docs", "changelog", "all"]),
				...dayCountInput.shape,
			}),
		)
		.query(({ input }) =>
			cachedHogQL(`top-landing:${input.scope}:${input.days}`, () =>
				fetchTopLandingPages(input.scope, input.days),
			),
		),

	// Visitors → download clicks → accounts → teams, by week. Accounts exclude
	// the company's own domain so dogfooding does not read as growth. Every
	// account gets a personal organization, so a team is the week an
	// organization gained its second member.
	conversions: adminProcedure.input(weekCountInput).query(({ input }) =>
		cachedHogQL(`conversions:v2:${input.weeks}`, async () => {
			const weeks = weekStarts(input.weeks);
			const [events, signups, teams] = await Promise.all([
				fetchConversionEvents(input.weeks),
				weeklyCreated(
					users,
					weeks,
					notLike(users.email, `%${COMPANY.EMAIL_DOMAIN}`),
				),
				weeklyTeamsFormed(weeks),
			]);
			return { ...events, signups, teams };
		}),
	),

	github: adminProcedure.query(() => fetchGithubStats()),

	discord: adminProcedure.query(() => fetchDiscordStats()),

	contentInventory: adminProcedure
		.input(weekCountInput)
		.query(({ input }) => fetchContentInventory(input.weeks)),

	searchConsole: adminProcedure
		.input(weekCountInput)
		.query(({ input }) => fetchSearchConsoleStats(input.weeks)),
} satisfies TRPCRouterRecord;
