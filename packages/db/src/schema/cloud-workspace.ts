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

// PostgreSQL enums for cloud workspaces
export const cloudWorkspaceStatus = pgEnum(
	"cloud_workspace_status",
	cloudWorkspaceStatusValues,
);
export const cloudProviderType = pgEnum(
	"cloud_provider_type",
	cloudProviderTypeValues,
);
export const cloudClientType = pgEnum(
	"cloud_client_type",
	cloudClientTypeValues,
);

// Cloud Workspaces table
export const cloudWorkspaces = pgTable(
	"cloud_workspaces",
	{
		id: uuid().primaryKey().defaultRandom(),

		// Ownership
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		repositoryId: uuid("repository_id")
			.notNull()
			.references(() => repositories.id, { onDelete: "cascade" }),
		creatorId: uuid("creator_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),

		// Workspace details
		name: text().notNull(),
		branch: text().notNull(),

		// Cloud provider
		providerType: cloudProviderType("provider_type")
			.notNull()
			.default("freestyle"),
		providerVmId: text("provider_vm_id"),

		// Status
		status: cloudWorkspaceStatus().notNull().default("provisioning"),
		statusMessage: text("status_message"),

		// Settings
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
		index("cloud_workspaces_provider_vm_id_idx").on(table.providerVmId),
	],
);

export type InsertCloudWorkspace = typeof cloudWorkspaces.$inferInsert;
export type SelectCloudWorkspace = typeof cloudWorkspaces.$inferSelect;

// Cloud Workspace Sessions table - tracks connected clients
export const cloudWorkspaceSessions = pgTable(
	"cloud_workspace_sessions",
	{
		id: uuid().primaryKey().defaultRandom(),

		// References
		workspaceId: uuid("workspace_id")
			.notNull()
			.references(() => cloudWorkspaces.id, { onDelete: "cascade" }),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),

		// Client info
		clientType: cloudClientType("client_type").notNull().default("desktop"),

		// Timestamps
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
