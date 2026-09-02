import {
	bigint,
	boolean,
	date,
	index,
	integer,
	numeric,
	pgEnum,
	pgTable,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core";
import { organizations, users } from "./auth";
import { leaderboardVisibilityValues } from "./enums";

export const leaderboardVisibility = pgEnum(
	"leaderboard_visibility",
	leaderboardVisibilityValues,
);

export const leaderboardParticipants = pgTable(
	"leaderboard_participants",
	{
		userId: uuid("user_id")
			.primaryKey()
			.references(() => users.id, { onDelete: "cascade" }),

		handle: text().notNull().unique(),
		visibility: leaderboardVisibility().notNull().default("public"),

		organizationId: uuid("organization_id").references(() => organizations.id, {
			onDelete: "set null",
		}),

		optedInAt: timestamp("opted_in_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		revokedAt: timestamp("revoked_at", { withTimezone: true }),
		// Shadow lever: publish still succeeds, but the board queries exclude the
		// participant. Distinct from revokedAt, which rejects the publish outright.
		flaggedAt: timestamp("flagged_at", { withTimezone: true }),
		lastPublishedAt: timestamp("last_published_at", { withTimezone: true }),

		payloadVersion: integer("payload_version").notNull().default(1),

		tokens: bigint({ mode: "number" }).notNull().default(0),
		usd: numeric({ precision: 20, scale: 6 }).notNull().default("0"),
		sessions: integer().notNull().default(0),

		uncachedInput: bigint("uncached_input", { mode: "number" })
			.notNull()
			.default(0),
		cachedInput: bigint("cached_input", { mode: "number" })
			.notNull()
			.default(0),
		cacheWrite5m: bigint("cache_write_5m", { mode: "number" })
			.notNull()
			.default(0),
		cacheWrite1h: bigint("cache_write_1h", { mode: "number" })
			.notNull()
			.default(0),
		output: bigint({ mode: "number" }).notNull().default(0),
		reasoningOutput: bigint("reasoning_output", { mode: "number" })
			.notNull()
			.default(0),

		approximate: boolean().notNull().default(false),

		dayRangeStart: date("day_range_start"),
		dayRangeEnd: date("day_range_end"),

		tier: integer().notNull().default(0),
		tierComputedAt: timestamp("tier_computed_at", { withTimezone: true }),
		activeDays: integer("active_days").notNull().default(0),
		axisWidth: numeric("axis_width", { precision: 6, scale: 2 })
			.notNull()
			.default("0"),
		axisDepth: bigint("axis_depth", { mode: "number" }).notNull().default(0),
		axisOutput: numeric("axis_output", { precision: 8, scale: 2 })
			.notNull()
			.default("0"),
		axisCost: numeric("axis_cost", { precision: 10, scale: 2 })
			.notNull()
			.default("0"),

		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		index("leaderboard_participants_tokens_idx").on(table.tokens),
		index("leaderboard_participants_org_idx").on(table.organizationId),
		index("leaderboard_participants_usd_idx").on(table.usd),
		index("leaderboard_participants_tier_idx").on(table.tier),
	],
);

export type SelectLeaderboardParticipant =
	typeof leaderboardParticipants.$inferSelect;
export type InsertLeaderboardParticipant =
	typeof leaderboardParticipants.$inferInsert;

export const leaderboardDaily = pgTable(
	"leaderboard_daily",
	{
		id: uuid().primaryKey().defaultRandom(),
		userId: uuid("user_id")
			.notNull()
			.references(() => leaderboardParticipants.userId, {
				onDelete: "cascade",
			}),

		day: date().notNull(),
		provider: text().notNull(),
		model: text().notNull(),
		hostId: text("host_id").notNull(),

		uncachedInput: bigint("uncached_input", { mode: "number" })
			.notNull()
			.default(0),
		cachedInput: bigint("cached_input", { mode: "number" })
			.notNull()
			.default(0),
		cacheWrite5m: bigint("cache_write_5m", { mode: "number" })
			.notNull()
			.default(0),
		cacheWrite1h: bigint("cache_write_1h", { mode: "number" })
			.notNull()
			.default(0),
		output: bigint({ mode: "number" }).notNull().default(0),

		reasoningOutput: bigint("reasoning_output", { mode: "number" })
			.notNull()
			.default(0),
		tokens: bigint({ mode: "number" }).notNull().default(0),

		usdEstimate: numeric("usd_estimate", { precision: 14, scale: 6 })
			.notNull()
			.default("0"),
		approximate: boolean().notNull().default(false),

		sessions: integer().notNull().default(0),

		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		unique("leaderboard_daily_identity_key").on(
			table.userId,
			table.day,
			table.provider,
			table.model,
			table.hostId,
		),

		index("leaderboard_daily_day_idx").on(table.day),
		index("leaderboard_daily_user_day_idx").on(table.userId, table.day),
		index("leaderboard_daily_model_day_idx").on(table.model, table.day),
	],
);

export type SelectLeaderboardDaily = typeof leaderboardDaily.$inferSelect;
export type InsertLeaderboardDaily = typeof leaderboardDaily.$inferInsert;

export const leaderboardDailyFactory = pgTable(
	"leaderboard_daily_factory",
	{
		id: uuid().primaryKey().defaultRandom(),
		userId: uuid("user_id")
			.notNull()
			.references(() => leaderboardParticipants.userId, {
				onDelete: "cascade",
			}),

		day: date().notNull(),
		hostId: text("host_id").notNull(),

		sessions: integer().notNull().default(0),

		parallelSessions: numeric("parallel_sessions", { precision: 6, scale: 2 })
			.notNull()
			.default("0"),
		agentPrsMerged: integer("agent_prs_merged").notNull().default(0),

		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		unique("leaderboard_daily_factory_identity_key").on(
			table.userId,
			table.day,
			table.hostId,
		),
		index("leaderboard_daily_factory_day_idx").on(table.day),
		index("leaderboard_daily_factory_user_day_idx").on(table.userId, table.day),
	],
);

export type SelectLeaderboardDailyFactory =
	typeof leaderboardDailyFactory.$inferSelect;
export type InsertLeaderboardDailyFactory =
	typeof leaderboardDailyFactory.$inferInsert;
