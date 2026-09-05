import { sql } from "drizzle-orm";
import {
	bigint,
	boolean,
	check,
	date,
	foreignKey,
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
import { handleOwnerTypeValues, leaderboardVisibilityValues } from "./enums";

export const leaderboardVisibility = pgEnum(
	"leaderboard_visibility",
	leaderboardVisibilityValues,
);

export const handleOwnerType = pgEnum(
	"handle_owner_type",
	handleOwnerTypeValues,
);

export const handles = pgTable(
	"handles",
	{
		handle: text().primaryKey(),
		ownerType: handleOwnerType("owner_type").notNull(),

		userId: uuid("user_id").references(() => users.id, {
			onDelete: "cascade",
		}),
		organizationId: uuid("organization_id").references(() => organizations.id, {
			onDelete: "cascade",
		}),

		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		unique("handles_user_key").on(table.userId),
		unique("handles_organization_key").on(table.organizationId),
		unique("handles_user_owner_key").on(table.handle, table.userId),
		index("handles_owner_type_idx").on(table.ownerType),
		check(
			"handles_owner_matches_type",
			sql`(
				(${table.ownerType} = 'user' and ${table.userId} is not null and ${table.organizationId} is null)
				or (${table.ownerType} = 'organization' and ${table.organizationId} is not null and ${table.userId} is null)
				or (${table.ownerType} = 'reserved' and ${table.userId} is null and ${table.organizationId} is null)
			)`,
		),
		check(
			"handles_shape",
			sql`length(${table.handle}) between 2 and 39 and ${table.handle} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`,
		),
	],
);

export type SelectHandle = typeof handles.$inferSelect;
export type InsertHandle = typeof handles.$inferInsert;

export const publicProfiles = pgTable(
	"public_profiles",
	{
		userId: uuid("user_id")
			.primaryKey()
			.references(() => users.id, { onDelete: "cascade" }),

		handle: text().notNull().unique(),
		visibility: leaderboardVisibility().notNull().default("public"),

		bio: text(),
		githubHandle: text("github_handle"),
		xHandle: text("x_handle"),
		websiteUrl: text("website_url"),

		organizationId: uuid("organization_id").references(() => organizations.id, {
			onDelete: "set null",
		}),

		optedInAt: timestamp("opted_in_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		revokedAt: timestamp("revoked_at", { withTimezone: true }),
		flaggedAt: timestamp("flagged_at", { withTimezone: true }),
		lastPublishedAt: timestamp("last_published_at", { withTimezone: true }),

		payloadVersion: integer("payload_version").notNull().default(1),

		awardsCatalogVersion: integer("awards_catalog_version")
			.notNull()
			.default(0),

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
		foreignKey({
			columns: [table.handle, table.userId],
			foreignColumns: [handles.handle, handles.userId],
			name: "public_profiles_handle_owner_fk",
		})
			.onDelete("cascade")
			.onUpdate("cascade"),
		index("public_profiles_tokens_idx").on(table.tokens),
		index("public_profiles_org_idx").on(table.organizationId),
		index("public_profiles_usd_idx").on(table.usd),
		index("public_profiles_tier_idx").on(table.tier),
		check("public_profiles_bio_length", sql`length(${table.bio}) <= 160`),
		check(
			"public_profiles_website_scheme",
			sql`${table.websiteUrl} is null or ${table.websiteUrl} ~ '^https://'`,
		),
	],
);

export type SelectPublicProfile = typeof publicProfiles.$inferSelect;
export type InsertPublicProfile = typeof publicProfiles.$inferInsert;

export const profileAwards = pgTable(
	"profile_awards",
	{
		id: uuid().primaryKey().defaultRandom(),
		userId: uuid("user_id")
			.notNull()
			.references(() => publicProfiles.userId, { onDelete: "cascade" }),

		slug: text().notNull(),
		tier: integer().notNull().default(0),

		value: numeric({ precision: 20, scale: 4 }).notNull().default("0"),

		awardedOn: date("awarded_on").notNull(),
		awardedAt: timestamp("awarded_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		unique("profile_awards_identity_key").on(
			table.userId,
			table.slug,
			table.tier,
		),
		index("profile_awards_user_idx").on(table.userId),
		index("profile_awards_slug_idx").on(table.slug, table.awardedAt),
	],
);

export type SelectProfileAward = typeof profileAwards.$inferSelect;
export type InsertProfileAward = typeof profileAwards.$inferInsert;
