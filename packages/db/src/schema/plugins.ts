import { sql } from "drizzle-orm";
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

export const pluginConnections = pgTable(
	"plugin_connections",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: uuid("organization_id").references(() => organizations.id, {
			onDelete: "cascade",
		}),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),

		pluginName: text("plugin_name").notNull(),
		installId: uuid("install_id").references(() => pluginInstalls.id, {
			onDelete: "set null",
		}),
		authMethod: text("auth_method").notNull().default("oauth2"),

		accessToken: text("access_token").notNull(),
		refreshToken: text("refresh_token"),
		tokenExpiresAt: timestamp("token_expires_at"),
		scopes: text().array(),

		config: jsonb(),

		externalAccountId: text("external_account_id").notNull(),
		externalAccountLabel: text("external_account_label"),

		disconnectedAt: timestamp("disconnected_at"),
		disconnectReason: text("disconnect_reason"),

		createdAt: timestamp("created_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at")
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		uniqueIndex("plugin_connections_account_active_unique")
			.on(table.userId, table.installId, table.externalAccountId)
			.where(sql`${table.disconnectedAt} IS NULL`),
		index("plugin_connections_user_plugin_idx").on(
			table.userId,
			table.pluginName,
		),
		index("plugin_connections_install_idx").on(table.installId),
	],
);

export type InsertPluginConnection = typeof pluginConnections.$inferInsert;
export type SelectPluginConnection = typeof pluginConnections.$inferSelect;

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
