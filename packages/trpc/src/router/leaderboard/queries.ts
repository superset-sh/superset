import { db } from "@superset/db/client";
import {
	leaderboardDaily,
	profileAwards,
	publicProfiles,
	users,
} from "@superset/db/schema";
import { and, desc, eq, gt, gte, isNull, lte, sql } from "drizzle-orm";
import { type LeaderboardPeriod, resolveWindow } from "./periods";
import { type Tier, tierProgress } from "./tier";
import type {
	LeaderboardMetric,
	LeaderboardStats,
	ParticipantProfile,
	StandingRow,
	StandingsResult,
	ViewerProfile,
} from "./types";

export type * from "./types";

export interface WindowOpts {
	period: LeaderboardPeriod;
	periodStart?: string;
	from?: string;
	to?: string;
}

export const onTheBoard = and(
	eq(publicProfiles.visibility, "public"),
	isNull(publicProfiles.revokedAt),
	isNull(publicProfiles.flaggedAt),
);

interface AxisColumns {
	axisWidth: string;
	axisDepth: number;
	axisOutput: string;
	axisCost: string;
	activeDays: number;
}

function toAxes(row: AxisColumns): StandingRow["axes"] {
	return {
		width: Number(row.axisWidth),
		depth: Number(row.axisDepth),
		output: Number(row.axisOutput),
		sustain: Number(row.activeDays),
		cost: Number(row.axisCost),
	};
}

export async function getStandings(
	opts: WindowOpts & {
		metric: LeaderboardMetric;
		limit: number;
		offset: number;
	},
): Promise<StandingsResult> {
	const range = resolveWindow(opts);
	const byCost = opts.metric === "cost";

	if (!range) {
		const rows = await db
			.select({
				handle: publicProfiles.handle,
				name: users.name,
				tokens: publicProfiles.tokens,
				usd: publicProfiles.usd,
				sessions: publicProfiles.sessions,
				approximate: publicProfiles.approximate,
				tier: publicProfiles.tier,
				axisWidth: publicProfiles.axisWidth,
				axisDepth: publicProfiles.axisDepth,
				axisOutput: publicProfiles.axisOutput,
				axisCost: publicProfiles.axisCost,
				activeDays: publicProfiles.activeDays,
			})
			.from(publicProfiles)
			.innerJoin(users, eq(users.id, publicProfiles.userId))

			.where(
				and(onTheBoard, isNull(users.deletedAt), gt(publicProfiles.tokens, 0)),
			)
			.orderBy(
				desc(byCost ? publicProfiles.usd : publicProfiles.tokens),
				publicProfiles.userId,
			)
			.limit(opts.limit)
			.offset(opts.offset);

		const [counted] = await db
			.select({ participants: sql<number>`count(*)::int` })
			.from(publicProfiles)
			.innerJoin(users, eq(users.id, publicProfiles.userId))
			.where(
				and(onTheBoard, isNull(users.deletedAt), gt(publicProfiles.tokens, 0)),
			);
		const participantCount = Number(counted?.participants ?? 0);

		return {
			period: opts.period,
			metric: opts.metric,
			range: null,
			total: participantCount,
			hasMore: opts.offset + rows.length < participantCount,
			rows: rows.map((row, index) => ({
				...row,
				tokens: Number(row.tokens),
				sessions: Number(row.sessions),
				rank: opts.offset + index + 1,
				axes: toAxes(row),
			})),
		};
	}

	const total = sql<number>`sum(${leaderboardDaily.tokens})`;
	const spend = sql<number>`sum(${leaderboardDaily.usdEstimate})`;
	const rows = await db
		.select({
			handle: publicProfiles.handle,
			name: users.name,
			tokens: sql<number>`${total}::bigint`,
			usd: sql<string>`sum(${leaderboardDaily.usdEstimate})`,
			sessions: sql<number>`sum(${leaderboardDaily.sessions})::int`,
			approximate: sql<boolean>`bool_or(${leaderboardDaily.approximate})`,
			tier: publicProfiles.tier,
			axisWidth: publicProfiles.axisWidth,
			axisDepth: publicProfiles.axisDepth,
			axisOutput: publicProfiles.axisOutput,
			axisCost: publicProfiles.axisCost,
			activeDays: publicProfiles.activeDays,
		})
		.from(leaderboardDaily)
		.innerJoin(
			publicProfiles,
			eq(publicProfiles.userId, leaderboardDaily.userId),
		)
		.innerJoin(users, eq(users.id, publicProfiles.userId))
		.where(
			and(
				gte(leaderboardDaily.day, range.from),
				lte(leaderboardDaily.day, range.to),
				onTheBoard,
				isNull(users.deletedAt),
			),
		)
		.groupBy(
			leaderboardDaily.userId,
			publicProfiles.handle,
			publicProfiles.tier,
			publicProfiles.axisWidth,
			publicProfiles.axisDepth,
			publicProfiles.axisOutput,
			publicProfiles.axisCost,
			publicProfiles.activeDays,
			users.name,
		)
		.orderBy(desc(byCost ? spend : total), leaderboardDaily.userId)
		.limit(opts.limit)
		.offset(opts.offset);

	const [counted] = await db
		.select({
			participants: sql<number>`count(distinct ${leaderboardDaily.userId})::int`,
		})
		.from(leaderboardDaily)
		.innerJoin(
			publicProfiles,
			eq(publicProfiles.userId, leaderboardDaily.userId),
		)
		.innerJoin(users, eq(users.id, publicProfiles.userId))
		.where(
			and(
				gte(leaderboardDaily.day, range.from),
				lte(leaderboardDaily.day, range.to),
				onTheBoard,
				isNull(users.deletedAt),
			),
		);
	const participantCount = Number(counted?.participants ?? 0);

	return {
		period: opts.period,
		metric: opts.metric,
		range,
		total: participantCount,
		hasMore: opts.offset + rows.length < participantCount,
		rows: rows.map((row, index) => ({
			...row,
			tokens: Number(row.tokens),
			sessions: Number(row.sessions),
			tier: Number(row.tier),
			rank: opts.offset + index + 1,
			axes: toAxes(row),
		})),
	};
}

export async function getStandingFor(
	handle: string,
	opts: WindowOpts & { metric: LeaderboardMetric },
): Promise<StandingRow | null> {
	const range = resolveWindow(opts);
	const byCost = opts.metric === "cost";

	const [profile] = await db
		.select({
			userId: publicProfiles.userId,
			handle: publicProfiles.handle,
			name: users.name,
			tier: publicProfiles.tier,
			tokens: publicProfiles.tokens,
			usd: publicProfiles.usd,
			sessions: publicProfiles.sessions,
			approximate: publicProfiles.approximate,
			axisWidth: publicProfiles.axisWidth,
			axisDepth: publicProfiles.axisDepth,
			axisOutput: publicProfiles.axisOutput,
			axisCost: publicProfiles.axisCost,
			activeDays: publicProfiles.activeDays,
		})
		.from(publicProfiles)
		.innerJoin(users, eq(users.id, publicProfiles.userId))
		.where(
			and(
				eq(publicProfiles.handle, handle),
				onTheBoard,
				isNull(users.deletedAt),
			),
		)
		.limit(1);

	if (!profile) return null;

	const axes = toAxes(profile);
	const base = {
		handle: profile.handle,
		name: profile.name,
		tier: Number(profile.tier),
		axes,
	};

	if (!range) {
		const tokens = Number(profile.tokens);
		if (tokens <= 0) return null;

		const ahead = await db.execute<{ ahead: number }>(sql`
			select count(*)::int as ahead
			from public_profiles p
			join auth.users u on u.id = p.user_id
			where p.visibility = 'public'
				and p.revoked_at is null
				and p.flagged_at is null
				and u.deleted_at is null
				and p.tokens > 0
				and ${
					byCost
						? sql`(p.usd > ${profile.usd} or (p.usd = ${profile.usd} and p.user_id < ${profile.userId}))`
						: sql`(p.tokens > ${tokens} or (p.tokens = ${tokens} and p.user_id < ${profile.userId}))`
				}
		`);

		return {
			...base,
			rank: Number(ahead.rows[0]?.ahead ?? 0) + 1,
			tokens,
			usd: profile.usd,
			sessions: Number(profile.sessions),
			approximate: profile.approximate,
		};
	}

	const [agg] = await db
		.select({
			tokens: sql<number>`coalesce(sum(${leaderboardDaily.tokens}), 0)::bigint`,
			usd: sql<string>`coalesce(sum(${leaderboardDaily.usdEstimate}), 0)`,
			sessions: sql<number>`coalesce(sum(${leaderboardDaily.sessions}), 0)::int`,
			approximate: sql<boolean>`coalesce(bool_or(${leaderboardDaily.approximate}), false)`,
		})
		.from(leaderboardDaily)
		.where(
			and(
				eq(leaderboardDaily.userId, profile.userId),
				gte(leaderboardDaily.day, range.from),
				lte(leaderboardDaily.day, range.to),
			),
		);

	const tokens = Number(agg?.tokens ?? 0);
	const usd = agg?.usd ?? "0";
	if (tokens <= 0) return null;

	const ahead = await db.execute<{ ahead: number }>(sql`
		with totals as (
			select d.user_id, sum(d.tokens) as tokens, sum(d.usd_estimate) as usd
			from leaderboard_daily d
			join public_profiles p on p.user_id = d.user_id
			join auth.users u on u.id = p.user_id
			where d.day between ${range.from} and ${range.to}
				and p.visibility = 'public'
				and p.revoked_at is null
				and p.flagged_at is null
				and u.deleted_at is null
			group by d.user_id
		)
		select count(*)::int as ahead
		from totals
		where ${
			byCost
				? sql`(usd > ${usd} or (usd = ${usd} and user_id < ${profile.userId}))`
				: sql`(tokens > ${tokens} or (tokens = ${tokens} and user_id < ${profile.userId}))`
		}
	`);

	return {
		...base,
		rank: Number(ahead.rows[0]?.ahead ?? 0) + 1,
		tokens,
		usd,
		sessions: Number(agg?.sessions ?? 0),
		approximate: Boolean(agg?.approximate),
	};
}

export async function getViewerProfile(
	userId: string,
): Promise<ViewerProfile | null> {
	const [row] = await db
		.select({
			handle: publicProfiles.handle,
			name: users.name,
			tier: publicProfiles.tier,
			axisWidth: publicProfiles.axisWidth,
			axisDepth: publicProfiles.axisDepth,
			axisOutput: publicProfiles.axisOutput,
			axisCost: publicProfiles.axisCost,
			activeDays: publicProfiles.activeDays,
		})
		.from(publicProfiles)
		.innerJoin(users, eq(users.id, publicProfiles.userId))
		.where(
			and(
				eq(publicProfiles.userId, userId),
				onTheBoard,
				isNull(users.deletedAt),
			),
		)
		.limit(1);

	if (!row) return null;

	return {
		handle: row.handle,
		name: row.name,
		tier: row.tier,
		axes: toAxes(row),
	};
}

export const SEARCH_LIMIT = 25;

export const SITEMAP_LIMIT = 5000;

export async function listPublicHandles(): Promise<
	Array<{ handle: string; lastPublishedAt: Date | null }>
> {
	return await db
		.select({
			handle: publicProfiles.handle,
			lastPublishedAt: publicProfiles.lastPublishedAt,
		})
		.from(publicProfiles)
		.innerJoin(users, eq(users.id, publicProfiles.userId))
		.where(and(onTheBoard, isNull(users.deletedAt)))
		.orderBy(desc(publicProfiles.tokens))
		.limit(SITEMAP_LIMIT);
}

export const SEARCH_MIN_LENGTH = 2;

const escapeLike = (value: string) =>
	value.replace(/[\\%_]/g, (char) => `\\${char}`);

interface SearchRow extends Record<string, unknown> {
	handle: string;
	name: string | null;
	tokens: string | number;
	usd: string;
	sessions: number;
	approximate: boolean;
	tier: number;
	axisWidth: string;
	axisDepth: number;
	axisOutput: string;
	axisCost: string;
	activeDays: number;
	rank: number;
}

export async function searchParticipants(
	term: string,
	opts: WindowOpts & { metric: LeaderboardMetric },
	limit = SEARCH_LIMIT,
): Promise<StandingRow[]> {
	const query = term.trim().toLowerCase();
	if (query.length < SEARCH_MIN_LENGTH) return [];

	const range = resolveWindow(opts);
	const byCost = opts.metric === "cost";
	const prefix = `${escapeLike(query)}%`;
	const contains = `%${escapeLike(query)}%`;
	const take = Math.min(limit, SEARCH_LIMIT);

	const ranked = range
		? sql`
			select
				p.handle,
				u.name,
				sum(d.tokens)::bigint as tokens,
				sum(d.usd_estimate) as usd,
				sum(d.sessions)::int as sessions,
				bool_or(d.approximate) as approximate,
				p.tier,
				p.axis_width, p.axis_depth, p.axis_output, p.axis_cost, p.active_days,
				row_number() over (
					order by ${byCost ? sql`sum(d.usd_estimate)` : sql`sum(d.tokens)`} desc, d.user_id
				)::int as rank
			from leaderboard_daily d
			join public_profiles p on p.user_id = d.user_id
			join auth.users u on u.id = p.user_id
			where d.day >= ${range.from}
				and d.day <= ${range.to}
				and p.visibility = 'public'
				and p.revoked_at is null
				and p.flagged_at is null
				and u.deleted_at is null
			group by d.user_id, p.handle, p.tier, p.axis_width, p.axis_depth,
				p.axis_output, p.axis_cost, p.active_days, u.name
		`
		: sql`
			select
				p.handle,
				u.name,
				p.tokens,
				p.usd,
				p.sessions,
				p.approximate,
				p.tier,
				p.axis_width, p.axis_depth, p.axis_output, p.axis_cost, p.active_days,
				row_number() over (
					order by ${byCost ? sql`p.usd` : sql`p.tokens`} desc, p.user_id
				)::int as rank
			from public_profiles p
			join auth.users u on u.id = p.user_id
			where p.visibility = 'public'
				and p.revoked_at is null
				and p.flagged_at is null
				and u.deleted_at is null
				and p.tokens > 0
		`;

	const result = await db.execute<SearchRow>(sql`
		with ranked as (${ranked})
		select
			handle, name, tokens, usd, sessions, approximate, tier,
			axis_width as "axisWidth", axis_depth as "axisDepth",
			axis_output as "axisOutput", axis_cost as "axisCost",
			active_days as "activeDays", rank
		from ranked
		where handle ilike ${prefix} escape '\\'
			or name ilike ${contains} escape '\\'
		order by rank
		limit ${take}
	`);

	return result.rows.map((row) => ({
		handle: row.handle,
		name: row.name,
		usd: row.usd,
		approximate: row.approximate,
		tokens: Number(row.tokens),
		sessions: Number(row.sessions),
		tier: Number(row.tier),
		rank: Number(row.rank),
		axes: toAxes(row),
	}));
}

const TOP_MODELS = 20;

async function getTierDistribution(): Promise<LeaderboardStats["tiers"]> {
	const rows = await db
		.select({
			tier: publicProfiles.tier,
			participants: sql<number>`count(*)::int`,
		})
		.from(publicProfiles)
		.innerJoin(users, eq(users.id, publicProfiles.userId))
		.where(and(onTheBoard, isNull(users.deletedAt)))
		.groupBy(publicProfiles.tier);

	const distribution = [0, 0, 0, 0, 0];
	for (const row of rows) {
		const tier = Number(row.tier);
		if (tier >= 0 && tier <= 4) {
			distribution[tier] = (distribution[tier] ?? 0) + Number(row.participants);
		}
	}

	const ranked = distribution.slice(1).reduce((sum, n) => sum + n, 0);

	const weighted = distribution.reduce(
		(sum, count, tier) => sum + count * tier,
		0,
	);
	const position = ranked > 0 ? Number((weighted / ranked).toFixed(3)) : 0;

	let mode = 0;
	let best = 0;
	for (let tier = 1; tier <= 4; tier++) {
		const count = distribution[tier] ?? 0;
		if (count > best) {
			best = count;
			mode = tier;
		}
	}

	return { distribution, ranked, mode, position };
}

export async function getStats(opts: WindowOpts): Promise<LeaderboardStats> {
	const range = resolveWindow(opts);
	const tiers = await getTierDistribution();

	const active = and(onTheBoard, isNull(users.deletedAt));
	const window = range
		? and(
				gte(leaderboardDaily.day, range.from),
				lte(leaderboardDaily.day, range.to),
				active,
			)
		: active;

	const [totalsRow] = await db
		.select({
			participants: sql<number>`count(distinct ${leaderboardDaily.userId})::int`,
			tokens: sql<number>`coalesce(sum(${leaderboardDaily.tokens}), 0)::bigint`,
			usd: sql<string>`coalesce(sum(${leaderboardDaily.usdEstimate}), 0)`,

			sessions: sql<number>`coalesce(sum(${leaderboardDaily.sessions}), 0)::int`,
			uncachedInput: sql<number>`coalesce(sum(${leaderboardDaily.uncachedInput}), 0)::bigint`,
			cachedInput: sql<number>`coalesce(sum(${leaderboardDaily.cachedInput}), 0)::bigint`,
			cacheWrite5m: sql<number>`coalesce(sum(${leaderboardDaily.cacheWrite5m}), 0)::bigint`,
			cacheWrite1h: sql<number>`coalesce(sum(${leaderboardDaily.cacheWrite1h}), 0)::bigint`,
			output: sql<number>`coalesce(sum(${leaderboardDaily.output}), 0)::bigint`,
			reasoningOutput: sql<number>`coalesce(sum(${leaderboardDaily.reasoningOutput}), 0)::bigint`,
		})
		.from(leaderboardDaily)
		.innerJoin(
			publicProfiles,
			eq(publicProfiles.userId, leaderboardDaily.userId),
		)
		.innerJoin(users, eq(users.id, publicProfiles.userId))
		.where(window);

	const modelUsers = await db
		.select({
			provider: leaderboardDaily.provider,
			model: leaderboardDaily.model,
			users: sql<number>`count(distinct ${leaderboardDaily.userId})::int`,
		})
		.from(leaderboardDaily)
		.innerJoin(
			publicProfiles,
			eq(publicProfiles.userId, leaderboardDaily.userId),
		)
		.innerJoin(users, eq(users.id, publicProfiles.userId))
		.where(window)
		.groupBy(leaderboardDaily.provider, leaderboardDaily.model)
		.orderBy(desc(sql`count(distinct ${leaderboardDaily.userId})`))
		.limit(TOP_MODELS);

	const modelSpend = await db
		.select({
			provider: leaderboardDaily.provider,
			model: leaderboardDaily.model,
			usd: sql<string>`sum(${leaderboardDaily.usdEstimate})`,
			tokens: sql<number>`sum(${leaderboardDaily.tokens})::bigint`,
		})
		.from(leaderboardDaily)
		.innerJoin(
			publicProfiles,
			eq(publicProfiles.userId, leaderboardDaily.userId),
		)
		.innerJoin(users, eq(users.id, publicProfiles.userId))
		.where(window)
		.groupBy(leaderboardDaily.provider, leaderboardDaily.model)
		.orderBy(desc(sql`sum(${leaderboardDaily.usdEstimate})`))
		.limit(TOP_MODELS);

	const modelTokens = await db
		.select({
			provider: leaderboardDaily.provider,
			model: leaderboardDaily.model,
			usd: sql<string>`sum(${leaderboardDaily.usdEstimate})`,
			tokens: sql<number>`sum(${leaderboardDaily.tokens})::bigint`,
		})
		.from(leaderboardDaily)
		.innerJoin(
			publicProfiles,
			eq(publicProfiles.userId, leaderboardDaily.userId),
		)
		.innerJoin(users, eq(users.id, publicProfiles.userId))
		.where(window)
		.groupBy(leaderboardDaily.provider, leaderboardDaily.model)
		.orderBy(desc(sql`sum(${leaderboardDaily.tokens})`))
		.limit(TOP_MODELS);

	return {
		period: opts.period,
		range,
		totals: {
			participants: Number(totalsRow?.participants ?? 0),
			tokens: Number(totalsRow?.tokens ?? 0),
			usd: String(totalsRow?.usd ?? "0"),
			sessions: Number(totalsRow?.sessions ?? 0),
		},
		tokenSplit: {
			uncachedInput: Number(totalsRow?.uncachedInput ?? 0),
			cachedInput: Number(totalsRow?.cachedInput ?? 0),
			cacheWrite5m: Number(totalsRow?.cacheWrite5m ?? 0),
			cacheWrite1h: Number(totalsRow?.cacheWrite1h ?? 0),
			output: Number(totalsRow?.output ?? 0),
			reasoningOutput: Number(totalsRow?.reasoningOutput ?? 0),
		},
		models: {
			byUsers: modelUsers.map((row) => ({ ...row, users: Number(row.users) })),
			bySpend: modelSpend.map((row) => ({
				...row,
				tokens: Number(row.tokens),
			})),
			byTokens: modelTokens.map((row) => ({
				...row,
				tokens: Number(row.tokens),
			})),
		},
		tiers,
	};
}

const PROFILE_TOP_MODELS = 8;

export async function getParticipant(
	handle: string,
	opts: WindowOpts,
): Promise<ParticipantProfile | null> {
	const [participant] = await db
		.select({
			userId: publicProfiles.userId,
			handle: publicProfiles.handle,
			name: users.name,
			joinedAt: publicProfiles.optedInAt,
			lastPublishedAt: publicProfiles.lastPublishedAt,
			dayRangeStart: publicProfiles.dayRangeStart,
			dayRangeEnd: publicProfiles.dayRangeEnd,
			tokens: publicProfiles.tokens,
			usd: publicProfiles.usd,
			sessions: publicProfiles.sessions,
			approximate: publicProfiles.approximate,
			tier: publicProfiles.tier,
			tierComputedAt: publicProfiles.tierComputedAt,
			activeDays: publicProfiles.activeDays,
			axisWidth: publicProfiles.axisWidth,
			axisDepth: publicProfiles.axisDepth,
			axisOutput: publicProfiles.axisOutput,
			axisCost: publicProfiles.axisCost,
			bio: publicProfiles.bio,
			githubHandle: publicProfiles.githubHandle,
			xHandle: publicProfiles.xHandle,
			websiteUrl: publicProfiles.websiteUrl,
		})
		.from(publicProfiles)
		.innerJoin(users, eq(users.id, publicProfiles.userId))
		.where(
			and(
				eq(publicProfiles.handle, handle.toLowerCase()),
				onTheBoard,
				isNull(users.deletedAt),
			),
		)
		.limit(1);

	if (!participant) return null;

	const range = resolveWindow(opts);
	const inWindow = range
		? and(
				eq(leaderboardDaily.userId, participant.userId),
				gte(leaderboardDaily.day, range.from),
				lte(leaderboardDaily.day, range.to),
			)
		: eq(leaderboardDaily.userId, participant.userId);

	const [windowTotals] = await db
		.select({
			tokens: sql<number>`coalesce(sum(${leaderboardDaily.tokens}), 0)::bigint`,
			usd: sql<string>`coalesce(sum(${leaderboardDaily.usdEstimate}), 0)`,
			sessions: sql<number>`coalesce(sum(${leaderboardDaily.sessions}), 0)::int`,
			uncachedInput: sql<number>`coalesce(sum(${leaderboardDaily.uncachedInput}), 0)::bigint`,
			cachedInput: sql<number>`coalesce(sum(${leaderboardDaily.cachedInput}), 0)::bigint`,
			cacheWrite5m: sql<number>`coalesce(sum(${leaderboardDaily.cacheWrite5m}), 0)::bigint`,
			cacheWrite1h: sql<number>`coalesce(sum(${leaderboardDaily.cacheWrite1h}), 0)::bigint`,
			output: sql<number>`coalesce(sum(${leaderboardDaily.output}), 0)::bigint`,
			reasoningOutput: sql<number>`coalesce(sum(${leaderboardDaily.reasoningOutput}), 0)::bigint`,
		})
		.from(leaderboardDaily)
		.where(inWindow);

	const models = await db
		.select({
			provider: leaderboardDaily.provider,
			model: leaderboardDaily.model,
			tokens: sql<number>`sum(${leaderboardDaily.tokens})::bigint`,
			usd: sql<string>`sum(${leaderboardDaily.usdEstimate})`,
		})
		.from(leaderboardDaily)
		.where(inWindow)
		.groupBy(leaderboardDaily.provider, leaderboardDaily.model)
		.orderBy(desc(sql`sum(${leaderboardDaily.tokens})`))
		.limit(PROFILE_TOP_MODELS);

	const daily = await db
		.select({
			day: leaderboardDaily.day,
			tokens: sql<number>`sum(${leaderboardDaily.tokens})::bigint`,
			usd: sql<string>`sum(${leaderboardDaily.usdEstimate})`,
		})
		.from(leaderboardDaily)
		.where(inWindow)
		.groupBy(leaderboardDaily.day)
		.orderBy(leaderboardDaily.day);

	const awards = await db
		.select({
			slug: profileAwards.slug,
			tier: profileAwards.tier,
			value: profileAwards.value,
			awardedOn: profileAwards.awardedOn,
		})
		.from(profileAwards)
		.where(eq(profileAwards.userId, participant.userId))
		.orderBy(profileAwards.slug, desc(profileAwards.tier));

	const [ranked] = await db
		.select({
			ahead: sql<number>`count(*) filter (where ${publicProfiles.tokens} > ${participant.tokens})::int`,
			total: sql<number>`count(*)::int`,
		})
		.from(publicProfiles)
		.innerJoin(users, eq(users.id, publicProfiles.userId))
		.where(
			and(onTheBoard, isNull(users.deletedAt), gt(publicProfiles.tokens, 0)),
		);

	return {
		handle: participant.handle,
		name: participant.name,
		joinedAt: participant.joinedAt,
		lastPublishedAt: participant.lastPublishedAt,
		dayRange:
			participant.dayRangeStart && participant.dayRangeEnd
				? { from: participant.dayRangeStart, to: participant.dayRangeEnd }
				: null,
		allTime: {
			tokens: Number(participant.tokens),
			usd: String(participant.usd),
			sessions: Number(participant.sessions),
			approximate: participant.approximate,
		},
		window: {
			range,
			tokens: Number(windowTotals?.tokens ?? 0),
			usd: String(windowTotals?.usd ?? "0"),
			sessions: Number(windowTotals?.sessions ?? 0),
		},
		rank: Number(ranked?.ahead ?? 0) + 1,
		total:
			Number(ranked?.total ?? 0) + (Number(participant.tokens) > 0 ? 0 : 1),
		factory: {
			tier: Number(participant.tier),
			progress: tierProgress(
				{
					width: Number(participant.axisWidth),
					depth: Number(participant.axisDepth),
					output: Number(participant.axisOutput),
					sustain: Number(participant.activeDays),
					cost: Number(participant.axisCost),
				},
				Number(participant.tier) as Tier,
			),
			computedAt: participant.tierComputedAt,
		},
		tokenSplit: {
			uncachedInput: Number(windowTotals?.uncachedInput ?? 0),
			cachedInput: Number(windowTotals?.cachedInput ?? 0),
			cacheWrite5m: Number(windowTotals?.cacheWrite5m ?? 0),
			cacheWrite1h: Number(windowTotals?.cacheWrite1h ?? 0),
			output: Number(windowTotals?.output ?? 0),
			reasoningOutput: Number(windowTotals?.reasoningOutput ?? 0),
		},
		models: models.map((row) => ({ ...row, tokens: Number(row.tokens) })),
		daily: daily.map((row) => ({ ...row, tokens: Number(row.tokens) })),
		bio: participant.bio,
		githubHandle: participant.githubHandle,
		xHandle: participant.xHandle,
		websiteUrl: participant.websiteUrl,
		axes: {
			width: Number(participant.axisWidth),
			depth: Number(participant.axisDepth),
			output: Number(participant.axisOutput),
			sustain: Number(participant.activeDays),
			cost: Number(participant.axisCost),
		},
		awards,
	};
}
