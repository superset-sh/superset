import {
	boolean,
	index,
	jsonb,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { organizations, users } from "./auth";

export const pluginInstalls = pgTable(
	"plugin_installs",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: uuid("organization_id").references(() => organizations.id, {
			onDelete: "cascade",
		}),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),

		marketplace: text().notNull(),
		pluginName: text("plugin_name").notNull(),
		version: text().notNull(),
		manifest: jsonb().notNull(),

		enabled: boolean().notNull().default(true),

		installedAt: timestamp("installed_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at")
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		uniqueIndex("plugin_installs_user_plugin_unique").on(
			table.userId,
			table.marketplace,
			table.pluginName,
		),
		index("plugin_installs_user_idx").on(table.userId),
	],
);

export type InsertPluginInstall = typeof pluginInstalls.$inferInsert;
export type SelectPluginInstall = typeof pluginInstalls.$inferSelect;

export const pluginMarketplaces = pgTable(
	"plugin_marketplaces",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: uuid("organization_id").references(() => organizations.id, {
			onDelete: "cascade",
		}),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),

		name: text().notNull(),
		sourceKind: text("source_kind").notNull(),
		repo: text(),
		ref: text(),
		path: text(),

		addedAt: timestamp("added_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at")
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		uniqueIndex("plugin_marketplaces_user_name_unique").on(
			table.userId,
			table.name,
		),
		index("plugin_marketplaces_user_idx").on(table.userId),
	],
);

export type InsertPluginMarketplace = typeof pluginMarketplaces.$inferInsert;
export type SelectPluginMarketplace = typeof pluginMarketplaces.$inferSelect;

export const pluginOauthClients = pgTable(
	"plugin_oauth_clients",
	{
		id: uuid().primaryKey().defaultRandom(),

		issuer: text().notNull(),
		redirectUri: text("redirect_uri").notNull(),

		clientId: text("client_id").notNull(),
		clientSecret: text("client_secret"),
		clientSecretExpiresAt: timestamp("client_secret_expires_at"),

		registrationAccessToken: text("registration_access_token"),
		registrationClientUri: text("registration_client_uri"),

		tokenEndpointAuthMethod: text("token_endpoint_auth_method"),

		createdAt: timestamp("created_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at")
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		uniqueIndex("plugin_oauth_clients_issuer_redirect_unique").on(
			table.issuer,
			table.redirectUri,
		),
	],
);

export type InsertPluginOauthClient = typeof pluginOauthClients.$inferInsert;
export type SelectPluginOauthClient = typeof pluginOauthClients.$inferSelect;
