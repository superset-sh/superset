import { z } from "zod";
import { isDayKey, LEADERBOARD_PERIODS } from "./periods";
import { isReservedHandle } from "./reserved-handles";

const dayKey = z.string().refine(isDayKey, "Expected a real YYYY-MM-DD date");

export const MAX_TOKENS_PER_ROW_FIELD = 50_000_000_000;

const tokenCount = z.number().int().min(0).max(MAX_TOKENS_PER_ROW_FIELD);

export const handleSchema = z
	.string()
	.trim()
	.toLowerCase()
	.min(2)
	.max(39)
	.regex(
		/^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){0,38}$/,
		"Letters, numbers and single dashes only",
	)
	.refine((handle) => !isReservedHandle(handle), "That handle is reserved");

export const visibilitySchema = z.enum(["public", "hidden"]);

export const periodSchema = z.enum(LEADERBOARD_PERIODS);

export const BIO_MAX = 160;

export const profileSchema = z.object({
	bio: z
		.string()
		.trim()
		.max(BIO_MAX)
		.transform((value) => value.replace(/https?:\/\/\S+/gi, "").trim())
		.nullable(),
	xHandle: z
		.string()
		.trim()
		.regex(/^@?[A-Za-z0-9_]{1,15}$/, "Letters, numbers and underscores only")
		.transform((value) => value.replace(/^@/, ""))
		.nullable(),
	websiteUrl: z
		.string()
		.trim()
		.url()
		.startsWith("https://", "Must start with https://")
		.max(200)
		.nullable(),
});

export const joinSchema = z.object({
	handle: handleSchema,
	visibility: visibilitySchema.default("public"),
});

// Same reasoning as the token cap, against the numeric(14,6) usd rollup.
export const MAX_USD_PER_ROW = 10_000;

export const publishDaySchema = z.object({
	day: dayKey,
	provider: z.string().min(1).max(64),
	model: z.string().min(1).max(128),
	uncachedInput: tokenCount,
	cachedInput: tokenCount,
	cacheWrite5m: tokenCount,
	cacheWrite1h: tokenCount,
	output: tokenCount,
	reasoningOutput: tokenCount,
	usdEstimate: z.number().min(0).max(MAX_USD_PER_ROW),
	approximate: z.boolean(),
	sessions: z.number().int().min(0).max(100_000),
});

export type PublishDay = z.infer<typeof publishDaySchema>;

export const publishFactoryDaySchema = z.object({
	day: dayKey,
	sessions: z.number().int().min(0).max(100_000),

	parallelSessions: z.number().min(0).max(10_000),
	agentPrsMerged: z.number().int().min(0).max(10_000),
});

export type PublishFactoryDay = z.infer<typeof publishFactoryDaySchema>;

// Rows, not days: 36 days x ~55 provider/model combos. Also keeps the insert
// under Postgres's 65,535 bind parameters at 15 columns per row.
export const PUBLISH_MAX_DAYS = 2_000;

// The widest a client legitimately reaches back is the 30-day join backfill;
// the extra days absorb host/server clock skew around a UTC midnight.
export const PUBLISH_WINDOW_DAYS = 35;

// hostId is a free-form client string and part of the upsert key, so without a
// bound the per-row caps above can be multiplied by inventing hosts.
export const MAX_HOSTS_PER_USER = 10;

export const PUBLISH_PAYLOAD_VERSION = 2;

export const publishSchema = z.object({
	payloadVersion: z.union([z.literal(1), z.literal(2)]),
	hostId: z.string().min(1).max(128),
	days: z.array(publishDaySchema).max(PUBLISH_MAX_DAYS),
	factoryDays: z
		.array(publishFactoryDaySchema)
		.max(PUBLISH_MAX_DAYS)
		.default([]),
});

export const metricSchema = z.enum(["tokens", "cost"]);

export const windowSchema = z.object({
	period: periodSchema.default("30d"),
	periodStart: dayKey.optional(),
	from: dayKey.optional(),
	to: dayKey.optional(),
});

export const standingsSchema = windowSchema.extend({
	metric: metricSchema.default("tokens"),
	limit: z.number().int().min(1).max(100).default(50),
	// OFFSET is O(n) over a grouped aggregate on an anonymous endpoint; the board
	// only pages sequentially, so deep scans are abuse rather than use.
	offset: z.number().int().min(0).max(1_000).default(0),
});

export const standingForSchema = windowSchema.extend({
	handle: handleSchema,
	metric: metricSchema.default("tokens"),
});

export const searchSchema = windowSchema.extend({
	query: z.string().trim().min(1).max(64),
	metric: metricSchema.default("tokens"),
});

export const participantSchema = windowSchema.extend({
	handle: handleSchema,
	period: periodSchema.default("all"),
});

export const previewRankSchema = z.object({
	period: periodSchema.default("month"),
	periodStart: dayKey.optional(),
	tokens: tokenCount,
});

export const meSchema = z.object({
	period: periodSchema.default("month"),
	periodStart: dayKey.optional(),
});
