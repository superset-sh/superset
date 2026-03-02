import {
	boolean,
	index,
	integer,
	jsonb,
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

export const oauthClients = authSchema.table("oauth_clients", {
	id: uuid("id").primaryKey().defaultRandom(),
	clientId: text("client_id").notNull().unique(),
	clientSecret: text("client_secret"),
	disabled: boolean("disabled").default(false),
	skipConsent: boolean("skip_consent"),
	enableEndSession: boolean("enable_end_session"),
	scopes: text("scopes").array(),
	userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
	createdAt: timestamp("created_at"),
	updatedAt: timestamp("updated_at"),
	name: text("name"),
	uri: text("uri"),
	icon: text("icon"),
	contacts: text("contacts").array(),
	tos: text("tos"),
	policy: text("policy"),
	softwareId: text("software_id"),
	softwareVersion: text("software_version"),
	softwareStatement: text("software_statement"),
	redirectUris: text("redirect_uris").array().notNull(),
	postLogoutRedirectUris: text("post_logout_redirect_uris").array(),
	tokenEndpointAuthMethod: text("token_endpoint_auth_method"),
	grantTypes: text("grant_types").array(),
	responseTypes: text("response_types").array(),
	public: boolean("public"),
	type: text("type"),
	referenceId: text("reference_id"),
	metadata: jsonb("metadata"),
});

export const oauthRefreshTokens = authSchema.table("oauth_refresh_tokens", {
	id: uuid("id").primaryKey().defaultRandom(),
	token: text("token").notNull(),
	clientId: text("client_id")
		.notNull()
		.references(() => oauthClients.clientId, { onDelete: "cascade" }),
	sessionId: uuid("session_id").references(() => sessions.id, {
		onDelete: "set null",
	}),
	userId: uuid("user_id")
		.notNull()
		.references(() => users.id, { onDelete: "cascade" }),
	referenceId: text("reference_id"),
	expiresAt: timestamp("expires_at"),
	createdAt: timestamp("created_at"),
	revoked: timestamp("revoked"),
	scopes: text("scopes").array().notNull(),
});

export const oauthAccessTokens = authSchema.table("oauth_access_tokens", {
	id: uuid("id").primaryKey().defaultRandom(),
	token: text("token").unique(),
	clientId: text("client_id")
		.notNull()
		.references(() => oauthClients.clientId, { onDelete: "cascade" }),
	sessionId: uuid("session_id").references(() => sessions.id, {
		onDelete: "set null",
	}),
	userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
	referenceId: text("reference_id"),
	refreshId: uuid("refresh_id").references(() => oauthRefreshTokens.id, {
		onDelete: "cascade",
	}),
	expiresAt: timestamp("expires_at"),
	createdAt: timestamp("created_at"),
	scopes: text("scopes").array().notNull(),
});

export const oauthConsents = authSchema.table("oauth_consents", {
	id: uuid("id").primaryKey().defaultRandom(),
	clientId: text("client_id")
		.notNull()
		.references(() => oauthClients.clientId, { onDelete: "cascade" }),
	userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
	referenceId: text("reference_id"),
	scopes: text("scopes").array().notNull(),
	createdAt: timestamp("created_at"),
	updatedAt: timestamp("updated_at"),
});

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

export const jwkss = authSchema.table("jwkss", {
	id: uuid("id").primaryKey().defaultRandom(),
	publicKey: text("public_key").notNull(),
	privateKey: text("private_key").notNull(),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	expiresAt: timestamp("expires_at"),
});
