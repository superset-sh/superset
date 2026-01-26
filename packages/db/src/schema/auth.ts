import {
	boolean,
	index,
	integer,
	pgSchema,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";

export const authSchema = pgSchema("auth");

export const users = authSchema.table("users", {
	id: uuid("id").primaryKey().defaultRandom(),
	name: text("name").notNull(),
	email: text("email").notNull().unique(),
	emailVerified: boolean("email_verified").default(false).notNull(),
	image: text("image"),
	// Have to denormalize this for electric sql to properly be able to filter
	// Users by org, as electric sql doesn't support joins.
	organizationIds: uuid("organization_ids").array().default([]).notNull(),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at")
		.defaultNow()
		.$onUpdate(() => new Date())
		.notNull(),
});

export type SelectUser = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const sessions = authSchema.table(
	"sessions",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		expiresAt: timestamp("expires_at").notNull(),
		token: text("token").notNull().unique(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.$onUpdate(() => new Date())
			.notNull(),
		ipAddress: text("ip_address"),
		userAgent: text("user_agent"),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		activeOrganizationId: uuid("active_organization_id"),
	},
	(table) => [index("sessions_user_id_idx").on(table.userId)],
);

export const accounts = authSchema.table(
	"accounts",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		accountId: text("account_id").notNull(),
		providerId: text("provider_id").notNull(),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		accessToken: text("access_token"),
		refreshToken: text("refresh_token"),
		idToken: text("id_token"),
		accessTokenExpiresAt: timestamp("access_token_expires_at"),
		refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
		scope: text("scope"),
		password: text("password"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [index("accounts_user_id_idx").on(table.userId)],
);

export const verifications = authSchema.table(
	"verifications",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		identifier: text("identifier").notNull(),
		value: text("value").notNull(),
		expiresAt: timestamp("expires_at").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [index("verifications_identifier_idx").on(table.identifier)],
);

export const organizations = authSchema.table(
	"organizations",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		name: text("name").notNull(),
		slug: text("slug").notNull().unique(),
		logo: text("logo"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		metadata: text("metadata"),
		stripeCustomerId: text("stripe_customer_id"),
	},
	(table) => [uniqueIndex("organizations_slug_idx").on(table.slug)],
);

export type SelectOrganization = typeof organizations.$inferSelect;
export type InsertOrganization = typeof organizations.$inferInsert;

export const members = authSchema.table(
	"members",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		role: text("role").default("member").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		index("members_organization_id_idx").on(table.organizationId),
		index("members_user_id_idx").on(table.userId),
	],
);

export type SelectMember = typeof members.$inferSelect;
export type InsertMember = typeof members.$inferInsert;

export const invitations = authSchema.table(
	"invitations",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		email: text("email").notNull(),
		role: text("role"),
		status: text("status").default("pending").notNull(),
		expiresAt: timestamp("expires_at").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		inviterId: uuid("inviter_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
	},
	(table) => [
		index("invitations_organization_id_idx").on(table.organizationId),
		index("invitations_email_idx").on(table.email),
	],
);

export type SelectInvitation = typeof invitations.$inferSelect;
export type InsertInvitation = typeof invitations.$inferInsert;

// OAuth/MCP tables for Better Auth MCP plugin
export const oauthApplications = authSchema.table(
	"oauth_applications",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		name: text("name"),
		icon: text("icon"),
		metadata: text("metadata"),
		clientId: text("client_id").unique(),
		clientSecret: text("client_secret"),
		redirectUrls: text("redirect_urls"),
		type: text("type"),
		disabled: boolean("disabled").default(false),
		userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
		createdAt: timestamp("created_at"),
		updatedAt: timestamp("updated_at"),
	},
	(table) => [index("oauth_applications_user_id_idx").on(table.userId)],
);

export const oauthAccessTokens = authSchema.table(
	"oauth_access_tokens",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		accessToken: text("access_token").unique(),
		refreshToken: text("refresh_token").unique(),
		accessTokenExpiresAt: timestamp("access_token_expires_at"),
		refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
		clientId: text("client_id").references(() => oauthApplications.clientId, {
			onDelete: "cascade",
		}),
		userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
		scopes: text("scopes"),
		createdAt: timestamp("created_at"),
		updatedAt: timestamp("updated_at"),
	},
	(table) => [
		index("oauth_access_tokens_client_id_idx").on(table.clientId),
		index("oauth_access_tokens_user_id_idx").on(table.userId),
	],
);

export const oauthConsents = authSchema.table(
	"oauth_consents",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		clientId: text("client_id").references(() => oauthApplications.clientId, {
			onDelete: "cascade",
		}),
		userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
		scopes: text("scopes"),
		createdAt: timestamp("created_at"),
		updatedAt: timestamp("updated_at"),
		consentGiven: boolean("consent_given"),
	},
	(table) => [
		index("oauth_consents_client_id_idx").on(table.clientId),
		index("oauth_consents_user_id_idx").on(table.userId),
	],
);

// Better Auth API Key plugin table
// Fields match generated schema, adapted for auth schema + UUID IDs
export const apikeys = authSchema.table(
	"apikeys",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		name: text("name"),
		start: text("start"),
		prefix: text("prefix"),
		key: text("key").notNull(),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		refillInterval: integer("refill_interval"),
		refillAmount: integer("refill_amount"),
		lastRefillAt: timestamp("last_refill_at"),
		enabled: boolean("enabled").default(true),
		rateLimitEnabled: boolean("rate_limit_enabled").default(true),
		rateLimitTimeWindow: integer("rate_limit_time_window").default(86400000),
		rateLimitMax: integer("rate_limit_max").default(10),
		requestCount: integer("request_count").default(0),
		remaining: integer("remaining"),
		lastRequest: timestamp("last_request"),
		expiresAt: timestamp("expires_at"),
		createdAt: timestamp("created_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at")
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
		permissions: text("permissions"),
		metadata: text("metadata"),
	},
	(table) => [
		index("apikeys_key_idx").on(table.key),
		index("apikeys_user_id_idx").on(table.userId),
	],
);

export type SelectApikey = typeof apikeys.$inferSelect;
export type InsertApikey = typeof apikeys.$inferInsert;
