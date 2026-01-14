import {
	index,
	integer,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";

import { organizations, users } from "./auth";
import {
	cloudClientTypeValues,
	cloudProviderTypeValues,
	cloudWorkspaceStatusValues,
} from "./enums";
import { repositories } from "./schema";

export const cloudWorkspaceStatus = pgEnum(
	"cloud_workspace_status",
	cloudWorkspaceStatusValues,
);

export const cloudProviderType = pgEnum(
	"cloud_provider_type",
	cloudProviderTypeValues,
);

export const cloudClientType = pgEnum("cloud_client_type", cloudClientTypeValues);

export const cloudWorkspaces = pgTable(
	"cloud_workspaces",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		repositoryId: uuid("repository_id")
			.notNull()
			.references(() => repositories.id, { onDelete: "cascade" }),
		name: text().notNull(),
		branch: text().notNull(),

		// Provider info
		providerType: cloudProviderType("provider_type").notNull().default("freestyle"),
		providerVmId: text("provider_vm_id"),

		// State
		status: cloudWorkspaceStatus().notNull().default("provisioning"),
		statusMessage: text("status_message"),

		// Configuration
		creatorId: uuid("creator_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		autoStopMinutes: integer("auto_stop_minutes").notNull().default(30),

		// Activity tracking
		lastActiveAt: timestamp("last_active_at"),

		// Timestamps
		createdAt: timestamp("created_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at")
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		index("cloud_workspaces_organization_id_idx").on(table.organizationId),
		index("cloud_workspaces_repository_id_idx").on(table.repositoryId),
		index("cloud_workspaces_creator_id_idx").on(table.creatorId),
		index("cloud_workspaces_status_idx").on(table.status),
	],
);

export type InsertCloudWorkspace = typeof cloudWorkspaces.$inferInsert;
export type SelectCloudWorkspace = typeof cloudWorkspaces.$inferSelect;

export const cloudWorkspaceSessions = pgTable(
	"cloud_workspace_sessions",
	{
		id: uuid().primaryKey().defaultRandom(),
		workspaceId: uuid("workspace_id")
			.notNull()
			.references(() => cloudWorkspaces.id, { onDelete: "cascade" }),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		clientType: cloudClientType("client_type").notNull(),
		connectedAt: timestamp("connected_at").notNull().defaultNow(),
		lastHeartbeatAt: timestamp("last_heartbeat_at").notNull().defaultNow(),
	},
	(table) => [
		index("cloud_workspace_sessions_workspace_id_idx").on(table.workspaceId),
		index("cloud_workspace_sessions_user_id_idx").on(table.userId),
	],
);

export type InsertCloudWorkspaceSession =
	typeof cloudWorkspaceSessions.$inferInsert;
export type SelectCloudWorkspaceSession =
	typeof cloudWorkspaceSessions.$inferSelect;
