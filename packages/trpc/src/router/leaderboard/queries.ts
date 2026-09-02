import { db } from "@superset/db/client";
import {
	leaderboardDaily,
	leaderboardParticipants,
	users,
} from "@superset/db/schema";
import { and, desc, eq, gt, gte, isNull, lte, sql } from "drizzle-orm";
import { type LeaderboardPeriod, resolveWindow } from "./periods";
import { type Tier, tierProgress } from "./tier";
import type {
	LeaderboardMetric,
	LeaderboardStats,
	ParticipantProfile,
	StandingsResult,
} from "./types";

export type * from "./types";

export interface WindowOpts {
	period: LeaderboardPeriod;
	periodStart?: string;
	from?: string;
	to?: string;
}

export const onTheBoard = and(
	eq(leaderboardParticipants.visibility, "public"),
	isNull(leaderboardParticipants.revokedAt),
	isNull(leaderboardParticipants.flaggedAt),
);

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
				handle: leaderboardParticipants.handle,
				name: users.name,
				tokens: leaderboardParticipants.tokens,
				usd: leaderboardParticipants.usd,
				sessions: leaderboardParticipants.sessions,
				approximate: leaderboardParticipants.approximate,
				tier: leaderboardParticipants.tier,
			})
			.from(leaderboardParticipants)
			.innerJoin(users, eq(users.id, leaderboardParticipants.userId))

			.where(
				and(
					onTheBoard,
					isNull(users.deletedAt),
					gt(leaderboardParticipants.tokens, 0),
				),
			)
			.orderBy(
				desc(
					byCost ? leaderboardParticipants.usd : leaderboardParticipants.tokens,
				),
				leaderboardParticipants.userId,
			)
			.limit(opts.limit)
			.offset(opts.offset);

		const [counted] = await db
			.select({ participants: sql<number>`count(*)::int` })
			.from(leaderboardParticipants)
			.innerJoin(users, eq(users.id, leaderboardParticipants.userId))
			.where(
				and(
					onTheBoard,
					isNull(users.deletedAt),
					gt(leaderboardParticipants.tokens, 0),
				),
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
			})),
		};
	}

	const total = sql<number>`sum(${leaderboardDaily.tokens})`;
	const spend = sql<number>`sum(${leaderboardDaily.usdEstimate})`;
	const rows = await db
		.select({
			handle: leaderboardParticipants.handle,
			name: users.name,
			tokens: sql<number>`${total}::bigint`,
			usd: sql<string>`sum(${leaderboardDaily.usdEstimate})`,
			sessions: sql<number>`sum(${leaderboardDaily.sessions})::int`,
			approximate: sql<boolean>`bool_or(${leaderboardDaily.approximate})`,
			tier: leaderboardParticipants.tier,
		})
		.from(leaderboardDaily)
		.innerJoin(
			leaderboardParticipants,
			eq(leaderboardParticipants.userId, leaderboardDaily.userId),
		)
		.innerJoin(users, eq(users.id, leaderboardParticipants.userId))
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
			leaderboardParticipants.handle,
			leaderboardParticipants.tier,
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
			leaderboardParticipants,
			eq(leaderboardParticipants.userId, leaderboardDaily.userId),
		)
		.innerJoin(users, eq(users.id, leaderboardParticipants.userId))
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
		})),
	};
}

const TOP_MODELS = 20;

async function getTierDistribution(): Promise<LeaderboardStats["tiers"]> {
	const rows = await db
		.select({
			tier: leaderboardParticipants.tier,
			participants: sql<number>`count(*)::int`,
		})
		.from(leaderboardParticipants)
		.innerJoin(users, eq(users.id, leaderboardParticipants.userId))
		.where(and(onTheBoard, isNull(users.deletedAt)))
		.groupBy(leaderboardParticipants.tier);

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
			leaderboardParticipants,
			eq(leaderboardParticipants.userId, leaderboardDaily.userId),
		)
		.innerJoin(users, eq(users.id, leaderboardParticipants.userId))
		.where(window);

	const modelUsers = await db
		.select({
			provider: leaderboardDaily.provider,
			model: leaderboardDaily.model,
			users: sql<number>`count(distinct ${leaderboardDaily.userId})::int`,
		})
		.from(leaderboardDaily)
		.innerJoin(
			leaderboardParticipants,
			eq(leaderboardParticipants.userId, leaderboardDaily.userId),
		)
		.innerJoin(users, eq(users.id, leaderboardParticipants.userId))
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
			leaderboardParticipants,
			eq(leaderboardParticipants.userId, leaderboardDaily.userId),
		)
		.innerJoin(users, eq(users.id, leaderboardParticipants.userId))
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
			leaderboardParticipants,
			eq(leaderboardParticipants.userId, leaderboardDaily.userId),
		)
		.innerJoin(users, eq(users.id, leaderboardParticipants.userId))
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
			userId: leaderboardParticipants.userId,
			handle: leaderboardParticipants.handle,
			name: users.name,
			joinedAt: leaderboardParticipants.optedInAt,
			lastPublishedAt: leaderboardParticipants.lastPublishedAt,
			dayRangeStart: leaderboardParticipants.dayRangeStart,
			dayRangeEnd: leaderboardParticipants.dayRangeEnd,
			tokens: leaderboardParticipants.tokens,
			usd: leaderboardParticipants.usd,
			sessions: leaderboardParticipants.sessions,
			approximate: leaderboardParticipants.approximate,
			tier: leaderboardParticipants.tier,
			tierComputedAt: leaderboardParticipants.tierComputedAt,
			activeDays: leaderboardParticipants.activeDays,
			axisWidth: leaderboardParticipants.axisWidth,
			axisDepth: leaderboardParticipants.axisDepth,
			axisOutput: leaderboardParticipants.axisOutput,
			axisCost: leaderboardParticipants.axisCost,
		})
		.from(leaderboardParticipants)
		.innerJoin(users, eq(users.id, leaderboardParticipants.userId))
		.where(
			and(
				eq(leaderboardParticipants.handle, handle.toLowerCase()),
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

	const [ranked] = await db
		.select({
			ahead: sql<number>`count(*) filter (where ${leaderboardParticipants.tokens} > ${participant.tokens})::int`,
			total: sql<number>`count(*)::int`,
		})
		.from(leaderboardParticipants)
		.innerJoin(users, eq(users.id, leaderboardParticipants.userId))
		.where(
			and(
				onTheBoard,
				isNull(users.deletedAt),
				gt(leaderboardParticipants.tokens, 0),
			),
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
	};
}
