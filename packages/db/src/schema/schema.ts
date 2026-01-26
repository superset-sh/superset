import {
	boolean,
	index,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	real,
	text,
	timestamp,
	unique,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";

import { organizations, users } from "./auth";
import {
	commandStatusValues,
	deviceTypeValues,
	integrationProviderValues,
	taskPriorityValues,
	taskStatusEnumValues,
} from "./enums";
import type { IntegrationConfig } from "./types";

export const taskStatus = pgEnum("task_status", taskStatusEnumValues);
export const taskPriority = pgEnum("task_priority", taskPriorityValues);
export const integrationProvider = pgEnum(
	"integration_provider",
	integrationProviderValues,
);
export const deviceType = pgEnum("device_type", deviceTypeValues);
export const commandStatus = pgEnum("command_status", commandStatusValues);

export const repositories = pgTable(
	"repositories",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		name: text().notNull(),
		slug: text().notNull(),
		repoUrl: text("repo_url").notNull(),
		repoOwner: text("repo_owner").notNull(),
		repoName: text("repo_name").notNull(),
		defaultBranch: text("default_branch").notNull().default("main"),
		createdAt: timestamp("created_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at")
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		index("repositories_organization_id_idx").on(table.organizationId),
		index("repositories_slug_idx").on(table.slug),
		unique("repositories_org_slug_unique").on(table.organizationId, table.slug),
	],
);

export type InsertRepository = typeof repositories.$inferInsert;
export type SelectRepository = typeof repositories.$inferSelect;

export const taskStatuses = pgTable(
	"task_statuses",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),

		name: text().notNull(),
		color: text().notNull(),
		type: text().notNull(),
		position: real().notNull(),
		progressPercent: real("progress_percent"),

		// External sync
		externalProvider: integrationProvider("external_provider"),
		externalId: text("external_id"),

		createdAt: timestamp("created_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at")
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		index("task_statuses_organization_id_idx").on(table.organizationId),
		index("task_statuses_type_idx").on(table.type),
		unique("task_statuses_org_external_unique").on(
			table.organizationId,
			table.externalProvider,
			table.externalId,
		),
	],
);

export type InsertTaskStatus = typeof taskStatuses.$inferInsert;
export type SelectTaskStatus = typeof taskStatuses.$inferSelect;

export const tasks = pgTable(
	"tasks",
	{
		id: uuid().primaryKey().defaultRandom(),

		// Core fields
		slug: text().notNull().unique(),
		title: text().notNull(),
		description: text(),
		statusId: uuid("status_id")
			.notNull()
			.references(() => taskStatuses.id),
		priority: taskPriority().notNull().default("none"),

		// Ownership
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		repositoryId: uuid("repository_id").references(() => repositories.id, {
			onDelete: "cascade",
		}),
		assigneeId: uuid("assignee_id").references(() => users.id, {
			onDelete: "set null",
		}),
		creatorId: uuid("creator_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),

		// Planning
		estimate: integer(),
		dueDate: timestamp("due_date"),
		labels: jsonb().$type<string[]>().default([]),

		// Git/Work tracking
		branch: text(),
		prUrl: text("pr_url"),

		// External sync (null if local-only task)
		externalProvider: integrationProvider("external_provider"),
		externalId: text("external_id"),
		externalKey: text("external_key"),
		externalUrl: text("external_url"),
		lastSyncedAt: timestamp("last_synced_at"),
		syncError: text("sync_error"),

		startedAt: timestamp("started_at"),
		completedAt: timestamp("completed_at"),
		deletedAt: timestamp("deleted_at"),

		// Timestamps
		createdAt: timestamp("created_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at")
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		index("tasks_slug_idx").on(table.slug),
		index("tasks_organization_id_idx").on(table.organizationId),
		index("tasks_repository_id_idx").on(table.repositoryId),
		index("tasks_assignee_id_idx").on(table.assigneeId),
		index("tasks_creator_id_idx").on(table.creatorId),
		index("tasks_status_id_idx").on(table.statusId),
		index("tasks_created_at_idx").on(table.createdAt),
		index("tasks_external_provider_idx").on(table.externalProvider),
		unique("tasks_external_unique").on(
			table.organizationId,
			table.externalProvider,
			table.externalId,
		),
	],
);

export type InsertTask = typeof tasks.$inferInsert;
export type SelectTask = typeof tasks.$inferSelect;

export const integrationConnections = pgTable(
	"integration_connections",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		connectedByUserId: uuid("connected_by_user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),

		provider: integrationProvider().notNull(),

		// OAuth tokens
		accessToken: text("access_token").notNull(),
		refreshToken: text("refresh_token"),
		tokenExpiresAt: timestamp("token_expires_at"),

		externalOrgId: text("external_org_id"),
		externalOrgName: text("external_org_name"),

		config: jsonb().$type<IntegrationConfig>(),

		createdAt: timestamp("created_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at")
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		unique("integration_connections_unique").on(
			table.organizationId,
			table.provider,
		),
		index("integration_connections_org_idx").on(table.organizationId),
	],
);

export type InsertIntegrationConnection =
	typeof integrationConnections.$inferInsert;
export type SelectIntegrationConnection =
	typeof integrationConnections.$inferSelect;

export const subscriptions = pgTable(
	"subscriptions",
	{
		id: uuid().primaryKey().defaultRandom(),
		plan: text().notNull(),
		referenceId: uuid("reference_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		stripeCustomerId: text("stripe_customer_id"),
		stripeSubscriptionId: text("stripe_subscription_id"),
		status: text().default("incomplete").notNull(),
		periodStart: timestamp("period_start"),
		periodEnd: timestamp("period_end"),
		trialStart: timestamp("trial_start"),
		trialEnd: timestamp("trial_end"),
		cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false),
		cancelAt: timestamp("cancel_at"),
		canceledAt: timestamp("canceled_at"),
		endedAt: timestamp("ended_at"),
		seats: integer(),
		createdAt: timestamp("created_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at")
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		index("subscriptions_reference_id_idx").on(table.referenceId),
		index("subscriptions_stripe_customer_id_idx").on(table.stripeCustomerId),
		index("subscriptions_status_idx").on(table.status),
	],
);

export type InsertSubscription = typeof subscriptions.$inferInsert;
export type SelectSubscription = typeof subscriptions.$inferSelect;

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
		deletedAt: timestamp("deleted_at"),
		createdAt: timestamp("created_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at")
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		index("cloud_workspaces_organization_id_idx").on(table.organizationId),
		index("cloud_workspaces_repository_id_idx").on(table.repositoryId),
	],
);

export type InsertCloudWorkspace = typeof cloudWorkspaces.$inferInsert;
export type SelectCloudWorkspace = typeof cloudWorkspaces.$inferSelect;

// Device presence - tracks online devices for command routing
export const devicePresence = pgTable(
	"device_presence",
	{
		id: uuid().primaryKey().defaultRandom(),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		deviceId: text("device_id").notNull(),
		deviceName: text("device_name").notNull(),
		deviceType: deviceType("device_type").notNull(),
		lastSeenAt: timestamp("last_seen_at").notNull().defaultNow(),
		createdAt: timestamp("created_at").notNull().defaultNow(),
	},
	(table) => [
		index("device_presence_user_org_idx").on(
			table.userId,
			table.organizationId,
		),
		uniqueIndex("device_presence_user_device_idx").on(
			table.userId,
			table.deviceId,
		),
		index("device_presence_last_seen_idx").on(table.lastSeenAt),
	],
);

export type InsertDevicePresence = typeof devicePresence.$inferInsert;
export type SelectDevicePresence = typeof devicePresence.$inferSelect;

// Agent commands - synced via Electric SQL to executors
export const agentCommands = pgTable(
	"agent_commands",
	{
		id: uuid().primaryKey().defaultRandom(),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		targetDeviceId: text("target_device_id"),
		targetDeviceType: text("target_device_type"),
		tool: text().notNull(),
		params: jsonb().$type<Record<string, unknown>>(),
		parentCommandId: uuid("parent_command_id"),
		status: commandStatus().notNull().default("pending"),
		claimedBy: text("claimed_by"),
		claimedAt: timestamp("claimed_at"),
		result: jsonb().$type<Record<string, unknown>>(),
		error: text(),
		createdAt: timestamp("created_at").notNull().defaultNow(),
		executedAt: timestamp("executed_at"),
		timeoutAt: timestamp("timeout_at"),
	},
	(table) => [
		index("agent_commands_user_status_idx").on(table.userId, table.status),
		index("agent_commands_target_device_status_idx").on(
			table.targetDeviceId,
			table.status,
		),
		index("agent_commands_org_created_idx").on(
			table.organizationId,
			table.createdAt,
		),
	],
);

export type InsertAgentCommand = typeof agentCommands.$inferInsert;
export type SelectAgentCommand = typeof agentCommands.$inferSelect;
