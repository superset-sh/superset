import { db, dbWs } from "@superset/db/client";
import {
	handles,
	leaderboardDaily,
	leaderboardDailyFactory,
	profileAwards,
	publicProfiles,
	userIdentities,
	users,
} from "@superset/db/schema";
import { TRPCError } from "@trpc/server";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { env } from "../../env";
import {
	createTRPCRouter,
	protectedProcedure,
	publicProcedure,
	userError,
} from "../../trpc";
import { requireActiveOrgMembership } from "../utils/active-org";
import { isUniqueViolation } from "../utils/unique-violation";
import {
	CATALOG_VERSION,
	DAY_ONE_COHORT,
	RUN_01,
	totalAwardableRows,
} from "./achievements";
import {
	type AwardInput,
	type EarnedAward,
	evaluateAwards,
	longestStreak,
} from "./awards";
import { type LeaderboardPeriod, resolveDayRange } from "./periods";
import {
	getParticipant,
	getStandingFor,
	getStandings,
	getStats,
	getViewerProfile,
	listPublicHandles,
	searchParticipants,
} from "./queries";
import {
	joinSchema,
	MAX_HOSTS_PER_USER,
	meSchema,
	PUBLISH_WINDOW_DAYS,
	participantSchema,
	previewRankSchema,
	profileSchema,
	publishSchema,
	searchSchema,
	standingForSchema,
	standingsSchema,
	windowSchema,
} from "./schema";
import { computeTier, type FactoryDayRow, type Tier } from "./tier";

const redis =
	env.KV_REST_API_URL && env.KV_REST_API_TOKEN
		? new Redis({ url: env.KV_REST_API_URL, token: env.KV_REST_API_TOKEN })
		: null;

const publishRateLimit = redis
	? new Ratelimit({
			redis,
			limiter: Ratelimit.slidingWindow(30, "1 h"),
			prefix: "ratelimit:leaderboard:publish",
		})
	: null;

const publicReadRateLimit = redis
	? new Ratelimit({
			redis,
			limiter: Ratelimit.slidingWindow(60, "1 m"),
			prefix: "ratelimit:leaderboard:public",
		})
	: null;

const joinRateLimit = redis
	? new Ratelimit({
			redis,
			limiter: Ratelimit.slidingWindow(10, "1 h"),
			prefix: "ratelimit:leaderboard:join",
		})
	: null;

const previewRateLimit = redis
	? new Ratelimit({
			redis,
			limiter: Ratelimit.slidingWindow(30, "1 h"),
			prefix: "ratelimit:leaderboard:preview",
		})
	: null;

/**
 * Write path: fail closed. A limiter outage becomes a clean retryable signal
 * rather than an unhandled 500. Anonymous reads use `enforceOpen` instead.
 */
async function enforce(
	limiter: Ratelimit | null,
	key: string,
	message: string,
): Promise<void> {
	if (!limiter) return;
	let success: boolean;
	try {
		({ success } = await limiter.limit(key));
	} catch (error) {
		console.error("[leaderboard] rate limiter unavailable:", error);
		throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message });
	}
	if (!success) {
		throw new TRPCError({ code: "TOO_MANY_REQUESTS", message });
	}
}

type Tx = Parameters<Parameters<typeof dbWs.transaction>[0]>[0];

/**
 * Both daily tables carry hostId, so counting one lets a factory-only payload
 * mint hosts freely. The participant row is locked first so concurrent
 * publishes cannot each observe a count below the cap and all write.
 */
async function enforceHostBudget(
	tx: Tx,
	userId: string,
	hostId: string,
): Promise<void> {
	await tx.execute(
		sql`select 1 from public_profiles where user_id = ${userId} for update`,
	);

	const seen = await tx.execute<{ hosts: number }>(sql`
		select count(*)::int as hosts from (
			select host_id from leaderboard_daily
			where user_id = ${userId} and host_id <> ${hostId}
			union
			select host_id from leaderboard_daily_factory
			where user_id = ${userId} and host_id <> ${hostId}
		) hosts
	`);

	if (Number(seen.rows[0]?.hosts ?? 0) >= MAX_HOSTS_PER_USER) {
		throw userError({
			code: "BAD_REQUEST",
			message: "Too many machines publishing for this account.",
			i18nKey: "serverError.leaderboard.tooManyMachinesPublishing",
		});
	}
}

const DAY_MS = 24 * 60 * 60 * 1000;

function utcDayKey(ms: number): string {
	return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Day keys are client-asserted, so an unbounded value would pollute
 * dayRangeStart/End and all-time totals — and a future-dated row would
 * pre-load tomorrow's board. One day of forward slack absorbs host/server
 * clock skew across a UTC midnight.
 */
function assertDaysInWindow(days: readonly { day: string }[]): void {
	if (days.length === 0) return;
	const now = Date.now();
	const oldest = utcDayKey(now - PUBLISH_WINDOW_DAYS * DAY_MS);
	const newest = utcDayKey(now + DAY_MS);

	for (const { day } of days) {
		if (day < oldest || day > newest) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: `Day ${day} is outside the publishable window.`,
			});
		}
	}
}

async function enforcePublicRead(headers: Headers): Promise<void> {
	if (!publicReadRateLimit) return;
	const ip =
		headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
		headers.get("x-real-ip") ||
		"unknown";

	let success: boolean;
	try {
		({ success } = await publicReadRateLimit.limit(ip));
	} catch (error) {
		// Fail open: these are CDN-cached anonymous reads, and a Redis blip
		// should not blank the public board.
		console.error("[leaderboard] public rate limiter unavailable:", error);
		return;
	}
	if (!success) {
		throw userError({
			code: "TOO_MANY_REQUESTS",
			message: "Rate limit exceeded.",
			i18nKey: "serverError.leaderboard.rateLimitExceeded",
		});
	}
}

function slugHandle(raw: string): string | null {
	const slug = raw
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 39)
		.replace(/-+$/g, "");
	return slug.length >= 2 ? slug : null;
}

const HANDLE_CONSTRAINT = "handles_pkey";

async function requireParticipant(userId: string) {
	const [row] = await db
		.select()
		.from(publicProfiles)
		.where(eq(publicProfiles.userId, userId))
		.limit(1);

	if (!row || row.revokedAt) {
		throw userError({
			code: "PRECONDITION_FAILED",
			message: "Not on the leaderboard. Opt in first.",
			i18nKey: "serverError.leaderboard.notOnTheLeaderboardOptIn",
		});
	}
	return row;
}

/**
 * Assigns straight from the aggregate in SQL. Round-tripping the bigint sums
 * through a JS number silently loses precision past 2^53, which would corrupt
 * all-time standings rather than fail loudly.
 */
export async function recomputeTotals(userId: string): Promise<void> {
	await db.execute(sql`
		update public_profiles p set
			tokens = t.tokens,
			usd = t.usd,
			sessions = t.sessions,
			uncached_input = t.uncached_input,
			cached_input = t.cached_input,
			cache_write_5m = t.cache_write_5m,
			cache_write_1h = t.cache_write_1h,
			output = t.output,
			reasoning_output = t.reasoning_output,
			approximate = t.approximate,
			day_range_start = t.day_range_start,
			day_range_end = t.day_range_end,
			last_published_at = now()
		from (
			select
				coalesce(sum(d.tokens), 0)::bigint as tokens,
				coalesce(sum(d.usd_estimate), 0) as usd,
				coalesce(sum(d.sessions), 0)::int as sessions,
				coalesce(sum(d.uncached_input), 0)::bigint as uncached_input,
				coalesce(sum(d.cached_input), 0)::bigint as cached_input,
				coalesce(sum(d.cache_write_5m), 0)::bigint as cache_write_5m,
				coalesce(sum(d.cache_write_1h), 0)::bigint as cache_write_1h,
				coalesce(sum(d.output), 0)::bigint as output,
				coalesce(sum(d.reasoning_output), 0)::bigint as reasoning_output,
				coalesce(bool_or(d.approximate), false) as approximate,
				min(d.day) as day_range_start,
				max(d.day) as day_range_end
			from leaderboard_daily d
			where d.user_id = ${userId}
		) t
		where p.user_id = ${userId}
	`);
}

const TIER_WINDOW_DAYS = 30;

function tierWindowStart(now: Date = new Date()): string {
	const start = new Date(now);
	start.setUTCDate(start.getUTCDate() - (TIER_WINDOW_DAYS - 1));
	return start.toISOString().slice(0, 10);
}

export async function recomputeTier(userId: string): Promise<void> {
	const from = tierWindowStart();

	const [factoryRows, tokenRows, current] = await Promise.all([
		db
			.select({
				day: leaderboardDailyFactory.day,
				sessions: sql<number>`coalesce(sum(${leaderboardDailyFactory.sessions}), 0)::int`,
				parallelSessions: sql<string>`coalesce(max(${leaderboardDailyFactory.parallelSessions}), 0)`,
				agentPrsMerged: sql<number>`coalesce(max(${leaderboardDailyFactory.agentPrsMerged}), 0)::int`,
				agentPrsAllHosts: sql<number>`coalesce(sum(${leaderboardDailyFactory.agentPrsMerged}), 0)::int`,
			})
			.from(leaderboardDailyFactory)
			.where(
				and(
					eq(leaderboardDailyFactory.userId, userId),
					gte(leaderboardDailyFactory.day, from),
				),
			)
			.groupBy(leaderboardDailyFactory.day),
		db
			.select({
				day: leaderboardDaily.day,
				tokens: sql<number>`coalesce(sum(${leaderboardDaily.tokens}), 0)::bigint`,
				usd: sql<string>`coalesce(sum(${leaderboardDaily.usdEstimate}), 0)`,
			})
			.from(leaderboardDaily)
			.where(
				and(
					eq(leaderboardDaily.userId, userId),
					gte(leaderboardDaily.day, from),
				),
			)
			.groupBy(leaderboardDaily.day),
		db
			.select({ tier: publicProfiles.tier })
			.from(publicProfiles)
			.where(eq(publicProfiles.userId, userId))
			.limit(1),
	]);

	const usdByDay = new Map(tokenRows.map((row) => [row.day, Number(row.usd)]));
	const tokensByDay = new Map(
		tokenRows.map((row) => [row.day, Number(row.tokens)]),
	);

	const rows: FactoryDayRow[] = factoryRows.map((row) => ({
		day: row.day,
		tokens: tokensByDay.get(row.day) ?? 0,
		sessions: Number(row.sessions),
		parallelSessions: Number(row.parallelSessions),
		agentPrsMerged: Number(row.agentPrsMerged),
		agentPrsAllHosts: Number(row.agentPrsAllHosts),
		usd: usdByDay.get(row.day) ?? 0,
	}));

	const result = computeTier(rows, (current[0]?.tier ?? 0) as Tier);

	await db
		.update(publicProfiles)
		.set({
			tier: result.tier,
			tierComputedAt: new Date(),
			activeDays: result.activeDays,
			axisWidth: result.axisWidth.toFixed(2),
			axisDepth: result.axisDepth,
			axisOutput: result.axisOutput.toFixed(2),
			axisCost: result.axisCost.toFixed(2),
		})
		.where(eq(publicProfiles.userId, userId));
}

async function collectAwardInput(userId: string): Promise<AwardInput | null> {
	const [profile] = await db
		.select({
			axisDepth: publicProfiles.axisDepth,
			axisCost: publicProfiles.axisCost,
			optedInAt: publicProfiles.optedInAt,
			tokens: publicProfiles.tokens,
			usd: publicProfiles.usd,
			sessions: publicProfiles.sessions,
		})
		.from(publicProfiles)
		.where(eq(publicProfiles.userId, userId))
		.limit(1);

	if (!profile) return null;

	const [factory, days, cohort] = await Promise.all([
		db
			.select({
				day: leaderboardDailyFactory.day,
				parallelSessions: sql<string>`max(${leaderboardDailyFactory.parallelSessions})`,
				agentPrsMerged: sql<number>`sum(${leaderboardDailyFactory.agentPrsMerged})::int`,
			})
			.from(leaderboardDailyFactory)
			.where(eq(leaderboardDailyFactory.userId, userId))
			.groupBy(leaderboardDailyFactory.day),
		db
			.selectDistinct({ day: leaderboardDaily.day })
			.from(leaderboardDaily)
			.where(eq(leaderboardDaily.userId, userId)),
		db
			.select({ ahead: sql<number>`count(*)::int` })
			.from(publicProfiles)
			.where(lte(publicProfiles.optedInAt, profile.optedInAt)),
	]);

	const runTier = await runWindowTier(userId);

	return {
		lifetimeAgentPrs: factory.reduce((sum, row) => sum + row.agentPrsMerged, 0),
		daysAtWidth2: factory.filter((row) => Number(row.parallelSessions) >= 2)
			.length,
		daysAtWidth3: factory.filter((row) => Number(row.parallelSessions) >= 3)
			.length,
		axisDepth: Number(profile.axisDepth),
		axisCost: Number(profile.axisCost),
		longestStreak: longestStreak(days.map((row) => row.day)),
		clearedRun01: runTier >= RUN_01.tier ? 1 : 0,
		isDayOne: Number(cohort[0]?.ahead ?? 0) <= DAY_ONE_COHORT ? 1 : 0,
		tokens: Number(profile.tokens),
		usd: Number(profile.usd),
		sessions: Number(profile.sessions),
		on: utcDayKey(Date.now()),
	};
}

async function runWindowTier(userId: string): Promise<number> {
	const today = utcDayKey(Date.now());
	if (today < RUN_01.from) return 0;

	const [factoryRows, tokenRows] = await Promise.all([
		db
			.select({
				day: leaderboardDailyFactory.day,
				sessions: sql<number>`coalesce(sum(${leaderboardDailyFactory.sessions}), 0)::int`,
				parallelSessions: sql<string>`coalesce(max(${leaderboardDailyFactory.parallelSessions}), 0)`,
				agentPrsMerged: sql<number>`coalesce(max(${leaderboardDailyFactory.agentPrsMerged}), 0)::int`,
				agentPrsAllHosts: sql<number>`coalesce(sum(${leaderboardDailyFactory.agentPrsMerged}), 0)::int`,
			})
			.from(leaderboardDailyFactory)
			.where(
				and(
					eq(leaderboardDailyFactory.userId, userId),
					gte(leaderboardDailyFactory.day, RUN_01.from),
					lte(leaderboardDailyFactory.day, RUN_01.to),
				),
			)
			.groupBy(leaderboardDailyFactory.day),
		db
			.select({
				day: leaderboardDaily.day,
				tokens: sql<number>`coalesce(sum(${leaderboardDaily.tokens}), 0)::bigint`,
				usd: sql<string>`coalesce(sum(${leaderboardDaily.usdEstimate}), 0)`,
			})
			.from(leaderboardDaily)
			.where(
				and(
					eq(leaderboardDaily.userId, userId),
					gte(leaderboardDaily.day, RUN_01.from),
					lte(leaderboardDaily.day, RUN_01.to),
				),
			)
			.groupBy(leaderboardDaily.day),
	]);

	const usdByDay = new Map(tokenRows.map((row) => [row.day, Number(row.usd)]));
	const tokensByDay = new Map(
		tokenRows.map((row) => [row.day, Number(row.tokens)]),
	);

	const rows: FactoryDayRow[] = factoryRows.map((row) => ({
		day: row.day,
		tokens: tokensByDay.get(row.day) ?? 0,
		sessions: Number(row.sessions),
		parallelSessions: Number(row.parallelSessions),
		agentPrsMerged: Number(row.agentPrsMerged),
		agentPrsAllHosts: Number(row.agentPrsAllHosts),
		usd: usdByDay.get(row.day) ?? 0,
	}));

	return computeTier(rows).tier;
}

export async function recomputeAwards(userId: string): Promise<EarnedAward[]> {
	const today = utcDayKey(Date.now());

	const [state] = await db
		.select({
			version: publicProfiles.awardsCatalogVersion,
			held: sql<number>`(
				select count(*)::int from ${profileAwards}
				where ${profileAwards.userId} = ${publicProfiles.userId}
			)`,
		})
		.from(publicProfiles)
		.where(eq(publicProfiles.userId, userId))
		.limit(1);

	if (!state) return [];

	const current = state.version >= CATALOG_VERSION;
	if (current && Number(state.held) >= totalAwardableRows(today)) return [];

	const input = await collectAwardInput(userId);
	if (!input) return [];

	if (!current) {
		await db
			.update(publicProfiles)
			.set({ awardsCatalogVersion: CATALOG_VERSION })
			.where(eq(publicProfiles.userId, userId));
	}

	const earned = evaluateAwards(input);
	if (earned.length === 0) return [];

	const inserted = await db
		.insert(profileAwards)
		.values(
			earned.map((award) => ({
				userId,
				slug: award.slug,
				tier: award.tier,
				value: award.value.toFixed(4),
				awardedOn: input.on,
			})),
		)
		.onConflictDoNothing({
			target: [profileAwards.userId, profileAwards.slug, profileAwards.tier],
		})
		.returning({ slug: profileAwards.slug, tier: profileAwards.tier });

	const fresh = new Set(inserted.map((row) => `${row.slug}:${row.tier}`));
	return earned.filter((award) => fresh.has(`${award.slug}:${award.tier}`));
}

async function rankFor(
	period: LeaderboardPeriod,
	periodStart: string | undefined,
	tokens: number,
	excludeUserId: string | null,
): Promise<{ rank: number; total: number }> {
	const range = resolveDayRange(period, periodStart);
	const exclude = excludeUserId
		? sql`and p.user_id <> ${excludeUserId}`
		: sql``;
	const eligible = sql`p.visibility = 'public' and p.revoked_at is null and p.flagged_at is null and u.deleted_at is null ${exclude}`;

	if (!range) {
		const rows = await db.execute<{ ahead: number; total: number }>(sql`
			select
				count(*) filter (where p.tokens > ${tokens})::int as ahead,
				count(*)::int as total
			from public_profiles p
			join auth.users u on u.id = p.user_id
			where ${eligible} and p.tokens > 0
		`);
		const row = rows.rows[0];
		return {
			rank: Number(row?.ahead ?? 0) + 1,
			total: Number(row?.total ?? 0),
		};
	}

	const rows = await db.execute<{ ahead: number; total: number }>(sql`
		with totals as (
			select d.user_id, sum(d.tokens) as tokens
			from leaderboard_daily d
			join public_profiles p on p.user_id = d.user_id
			join auth.users u on u.id = p.user_id
			where d.day between ${range.from} and ${range.to} and ${eligible}
			group by d.user_id
		)
		select
			count(*) filter (where tokens > ${tokens})::int as ahead,
			count(*)::int as total
		from totals
	`);
	const row = rows.rows[0];
	return { rank: Number(row?.ahead ?? 0) + 1, total: Number(row?.total ?? 0) };
}

export const leaderboardRouter = createTRPCRouter({
	join: protectedProcedure
		.input(joinSchema)
		.mutation(async ({ ctx, input }) => {
			const userId = ctx.session.user.id;

			await enforce(
				joinRateLimit,
				userId,
				"Too many attempts. Try again later.",
			);

			const [taken] = await db
				.select({ userId: handles.userId })
				.from(handles)
				.where(eq(handles.handle, input.handle))
				.limit(1);

			if (taken && taken.userId !== userId) {
				throw userError({
					code: "CONFLICT",
					message: "That handle is taken.",
					i18nKey: "serverError.leaderboard.thatHandleIsTaken",
				});
			}

			const organizationId = await requireActiveOrgMembership(ctx);

			const [github] = await db
				.select({ handle: userIdentities.handle })
				.from(userIdentities)
				.where(
					and(
						eq(userIdentities.userId, userId),
						eq(userIdentities.provider, "github"),
					),
				)
				.limit(1);

			try {
				return await dbWs.transaction(async (tx) => {
					const [owned] = await tx
						.select({ handle: handles.handle })
						.from(handles)
						.where(eq(handles.userId, userId))
						.limit(1);

					if (!owned) {
						await tx.insert(handles).values({
							handle: input.handle,
							ownerType: "user",
							userId,
						});
					} else if (owned.handle !== input.handle) {
						await tx
							.update(handles)
							.set({ handle: input.handle })
							.where(eq(handles.userId, userId));
					}

					const [row] = await tx
						.insert(publicProfiles)
						.values({
							userId,
							handle: input.handle,
							visibility: input.visibility,
							organizationId,
							githubHandle: github?.handle ?? null,
						})
						.onConflictDoUpdate({
							target: publicProfiles.userId,
							set: {
								handle: input.handle,
								visibility: input.visibility,
								organizationId,
								githubHandle: github?.handle ?? null,
								optedInAt: new Date(),
							},
						})
						.returning();

					return row;
				});
			} catch (error) {
				if (isUniqueViolation(error, HANDLE_CONSTRAINT)) {
					throw userError({
						code: "CONFLICT",
						message: "That handle is taken.",
						i18nKey: "serverError.leaderboard.thatHandleIsTaken",
					});
				}
				throw error;
			}
		}),

	suggestedHandle: protectedProcedure.query(async ({ ctx }) => {
		const userId = ctx.session.user.id;

		const [identity] = await db
			.select({ handle: userIdentities.handle })
			.from(userIdentities)
			.where(
				and(
					eq(userIdentities.userId, userId),
					eq(userIdentities.provider, "github"),
				),
			)
			.limit(1);

		const [account] = await db
			.select({ name: users.name, email: users.email })
			.from(users)
			.where(eq(users.id, userId))
			.limit(1);

		const candidate =
			identity?.handle ??
			account?.name ??
			account?.email?.split("@")[0] ??
			null;
		const suggestion = candidate ? slugHandle(candidate) : null;
		if (!suggestion) return { handle: null, taken: false, source: null };

		const [clash] = await db
			.select({ userId: handles.userId })
			.from(handles)
			.where(eq(handles.handle, suggestion))
			.limit(1);

		return {
			handle: suggestion,
			taken: Boolean(clash && clash.userId !== userId),
			source: identity?.handle ? ("github" as const) : ("account" as const),
		};
	}),

	updateProfile: protectedProcedure
		.input(profileSchema)
		.mutation(async ({ ctx, input }) => {
			const userId = ctx.session.user.id;
			await requireParticipant(userId);

			const [row] = await db
				.update(publicProfiles)
				.set({
					bio: input.bio || null,
					xHandle: input.xHandle || null,
					websiteUrl: input.websiteUrl || null,
				})
				.where(eq(publicProfiles.userId, userId))
				.returning({
					bio: publicProfiles.bio,
					xHandle: publicProfiles.xHandle,
					websiteUrl: publicProfiles.websiteUrl,
				});

			return row ?? null;
		}),

	setVisibility: protectedProcedure
		.input(joinSchema.pick({ visibility: true }))
		.mutation(async ({ ctx, input }) => {
			await requireParticipant(ctx.session.user.id);
			await db
				.update(publicProfiles)
				.set({ visibility: input.visibility })
				.where(eq(publicProfiles.userId, ctx.session.user.id));
			return { success: true };
		}),

	leave: protectedProcedure.mutation(async ({ ctx }) => {
		const userId = ctx.session.user.id;
		await dbWs.transaction(async (tx) => {
			await tx
				.delete(leaderboardDaily)
				.where(eq(leaderboardDaily.userId, userId));
			await tx
				.delete(leaderboardDailyFactory)
				.where(eq(leaderboardDailyFactory.userId, userId));
			await tx.delete(publicProfiles).where(eq(publicProfiles.userId, userId));
		});
		return { success: true };
	}),

	publish: protectedProcedure
		.input(publishSchema)
		.mutation(async ({ ctx, input }) => {
			const userId = ctx.session.user.id;
			await enforce(
				publishRateLimit,
				userId,
				"Too many publishes. Try again later.",
			);
			await requireParticipant(userId);

			if (input.days.length === 0 && input.factoryDays.length === 0) {
				return { written: 0, days: 0, awarded: [] as EarnedAward[] };
			}

			assertDaysInWindow(input.days);
			assertDaysInWindow(input.factoryDays);
			const rows = input.days.map((day) => ({
				userId,
				day: day.day,
				provider: day.provider,
				model: day.model,
				hostId: input.hostId,
				uncachedInput: day.uncachedInput,
				cachedInput: day.cachedInput,
				cacheWrite5m: day.cacheWrite5m,
				cacheWrite1h: day.cacheWrite1h,
				output: day.output,
				reasoningOutput: day.reasoningOutput,

				tokens:
					day.uncachedInput +
					day.cachedInput +
					day.cacheWrite5m +
					day.cacheWrite1h +
					day.output,
				usdEstimate: day.usdEstimate.toFixed(6),
				approximate: day.approximate,
				sessions: day.sessions,
			}));

			await dbWs.transaction(async (tx) => {
				await enforceHostBudget(tx, userId, input.hostId);

				if (rows.length > 0) {
					await tx
						.insert(leaderboardDaily)
						.values(rows)
						.onConflictDoUpdate({
							target: [
								leaderboardDaily.userId,
								leaderboardDaily.day,
								leaderboardDaily.provider,
								leaderboardDaily.model,
								leaderboardDaily.hostId,
							],
							set: {
								uncachedInput: sql`excluded.uncached_input`,
								cachedInput: sql`excluded.cached_input`,
								cacheWrite5m: sql`excluded.cache_write_5m`,
								cacheWrite1h: sql`excluded.cache_write_1h`,
								output: sql`excluded.output`,
								reasoningOutput: sql`excluded.reasoning_output`,
								tokens: sql`excluded.tokens`,
								usdEstimate: sql`excluded.usd_estimate`,
								approximate: sql`excluded.approximate`,
								sessions: sql`excluded.sessions`,
								updatedAt: new Date(),
							},
						});
				}

				if (input.factoryDays.length > 0) {
					await tx
						.insert(leaderboardDailyFactory)
						.values(
							input.factoryDays.map((day) => ({
								userId,
								day: day.day,
								hostId: input.hostId,
								sessions: day.sessions,
								parallelSessions: day.parallelSessions.toFixed(2),
								agentPrsMerged: day.agentPrsMerged,
							})),
						)
						.onConflictDoUpdate({
							target: [
								leaderboardDailyFactory.userId,
								leaderboardDailyFactory.day,
								leaderboardDailyFactory.hostId,
							],
							set: {
								sessions: sql`excluded.sessions`,
								parallelSessions: sql`excluded.parallel_sessions`,
								agentPrsMerged: sql`excluded.agent_prs_merged`,
								updatedAt: new Date(),
							},
						});
				}
			});

			await recomputeTotals(userId);
			await recomputeTier(userId);
			const awarded =
				rows.length > 0 || input.factoryDays.length > 0
					? await recomputeAwards(userId)
					: [];
			const distinctDays = new Set([
				...input.days.map((day) => day.day),
				...input.factoryDays.map((day) => day.day),
			]).size;
			return { written: rows.length, days: distinctDays, awarded };
		}),

	standings: protectedProcedure
		.input(standingsSchema)
		.query(async ({ input }) => await getStandings(input)),

	public: createTRPCRouter({
		standings: publicProcedure
			.input(standingsSchema)
			.query(async ({ ctx, input }) => {
				await enforcePublicRead(ctx.headers);
				return await getStandings(input);
			}),

		stats: publicProcedure.input(windowSchema).query(async ({ ctx, input }) => {
			await enforcePublicRead(ctx.headers);
			return await getStats(input);
		}),

		handles: publicProcedure.query(async ({ ctx }) => {
			await enforcePublicRead(ctx.headers);
			return await listPublicHandles();
		}),

		standing: publicProcedure
			.input(standingForSchema)
			.query(async ({ ctx, input }) => {
				await enforcePublicRead(ctx.headers);
				const { handle, ...window } = input;
				return getStandingFor(handle, window);
			}),

		search: publicProcedure
			.input(searchSchema)
			.query(async ({ ctx, input }) => {
				await enforcePublicRead(ctx.headers);
				const { query, ...window } = input;
				return await searchParticipants(query, window);
			}),

		participant: publicProcedure
			.input(participantSchema)
			.query(async ({ ctx, input }) => {
				await enforcePublicRead(ctx.headers);
				const profile = await getParticipant(input.handle, input);
				if (!profile) {
					throw userError({
						code: "NOT_FOUND",
						message: "Not found",
						i18nKey: "serverError.leaderboard.notFound",
					});
				}
				return profile;
			}),
	}),

	previewRank: protectedProcedure
		.input(previewRankSchema)
		.query(async ({ ctx, input }) => {
			await enforce(
				previewRateLimit,
				ctx.session.user.id,
				"Too many rank previews. Try again later.",
			);

			const { rank, total } = await rankFor(
				input.period,
				input.periodStart,
				input.tokens,
				ctx.session.user.id,
			);

			return {
				rank,

				total: total + 1,
				percentile:
					total > 0 ? Math.round((1 - (rank - 1) / total) * 100) : null,
			};
		}),

	viewer: protectedProcedure.query(({ ctx }) =>
		getViewerProfile(ctx.session.user.id),
	),

	me: protectedProcedure.input(meSchema).query(async ({ ctx, input }) => {
		const userId = ctx.session.user.id;
		const [row] = await db
			.select()
			.from(publicProfiles)
			.where(eq(publicProfiles.userId, userId))
			.limit(1);

		if (!row || row.revokedAt) return null;

		const range = resolveDayRange(input.period, input.periodStart);
		let tokens = row.tokens;

		if (range) {
			const [agg] = await db
				.select({
					tokens: sql<number>`coalesce(sum(${leaderboardDaily.tokens}), 0)::bigint`,
				})
				.from(leaderboardDaily)
				.where(
					and(
						eq(leaderboardDaily.userId, userId),
						gte(leaderboardDaily.day, range.from),
						lte(leaderboardDaily.day, range.to),
					),
				);
			tokens = Number(agg?.tokens ?? 0);
		}

		const { rank, total } = await rankFor(
			input.period,
			input.periodStart,
			tokens,
			userId,
		);

		return {
			handle: row.handle,
			visibility: row.visibility,
			lastPublishedAt: row.lastPublishedAt,
			period: input.period,
			range,
			tokens,
			usd: row.usd,
			sessions: row.sessions,
			approximate: row.approximate,
			rank,
			total: total + 1,
		};
	}),
});
