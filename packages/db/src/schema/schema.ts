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
	workspaceTypeValues,
} from "./enums";
import { githubRepositories } from "./github";
import type { IntegrationConfig } from "./types";
import type { WorkspaceConfig } from "./zod";

export const taskStatus = pgEnum("task_status", taskStatusEnumValues);
export const taskPriority = pgEnum("task_priority", taskPriorityValues);
export const integrationProvider = pgEnum(
	"integration_provider",
	integrationProviderValues,
);
export const deviceType = pgEnum("device_type", deviceTypeValues);
export const commandStatus = pgEnum("command_status", commandStatusValues);

export const taskStatuses = pgTable(
	"task_statuses",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),

		name: text().notNull(),
		color: text().notNull(),
		type: text().notNull(), // "backlog" | "unstarted" | "started" | "completed" | "canceled"
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
		slug: text().notNull(),
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
		externalKey: text("external_key"), // "SUPER-172", "#123"
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
		unique("tasks_org_slug_unique").on(table.organizationId, table.slug),
	],
);

export type InsertTask = typeof tasks.$inferInsert;
export type SelectTask = typeof tasks.$inferSelect;

export const taskAssets = pgTable(
	"task_assets",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		taskId: uuid("task_id")
			.notNull()
			.references(() => tasks.id, { onDelete: "cascade" }),
		externalProvider: integrationProvider("external_provider").notNull(),
		sourceKind: text("source_kind").notNull(),
		sourceUrl: text("source_url").notNull(),
		sourceHash: text("source_hash").notNull(),
		blobUrl: text("blob_url").notNull(),
		mimeType: text("mime_type"),
		sizeBytes: integer("size_bytes"),
		lastSyncedAt: timestamp("last_synced_at").notNull().defaultNow(),
		createdAt: timestamp("created_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at")
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		index("task_assets_org_idx").on(table.organizationId),
		index("task_assets_task_idx").on(table.taskId),
		index("task_assets_provider_idx").on(table.externalProvider),
		unique("task_assets_unique_source").on(
			table.organizationId,
			table.taskId,
			table.sourceHash,
		),
	],
);

export type InsertTaskAsset = typeof taskAssets.$inferInsert;
export type SelectTaskAsset = typeof taskAssets.$inferSelect;

export const taskComments = pgTable(
	"task_comments",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		taskId: uuid("task_id")
			.notNull()
			.references(() => tasks.id, { onDelete: "cascade" }),
		body: text().notNull(),
		authorExternalId: text("author_external_id"),
		authorName: text("author_name"),
		authorAvatarUrl: text("author_avatar_url"),
		externalProvider: integrationProvider("external_provider").notNull(),
		externalId: text("external_id").notNull(),
		externalUrl: text("external_url"),
		parentCommentExternalId: text("parent_comment_external_id"),
		lastSyncedAt: timestamp("last_synced_at").notNull().defaultNow(),
		deletedAt: timestamp("deleted_at"),
		createdAt: timestamp("created_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at")
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		index("task_comments_org_idx").on(table.organizationId),
		index("task_comments_task_created_idx").on(table.taskId, table.createdAt),
		index("task_comments_provider_idx").on(table.externalProvider),
		unique("task_comments_external_unique").on(
			table.organizationId,
			table.externalProvider,
			table.externalId,
		),
	],
);

export type InsertTaskComment = typeof taskComments.$inferInsert;
export type SelectTaskComment = typeof taskComments.$inferSelect;

// Integration connections for external providers (Linear, GitHub, etc.)
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

// Stripe subscriptions (org-based billing)
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
		lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
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
		result: jsonb().$type<Record<string, unknown>>(),
		error: text(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		executedAt: timestamp("executed_at", { withTimezone: true }),
		timeoutAt: timestamp("timeout_at", { withTimezone: true }),
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

export const usersSlackUsers = pgTable(
	"users__slack_users",
	{
		id: uuid().primaryKey().defaultRandom(),
		slackUserId: text("slack_user_id").notNull(),
		teamId: text("team_id").notNull(),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		modelPreference: text("model_preference"),
		createdAt: timestamp("created_at").notNull().defaultNow(),
	},
	(table) => [
		unique("users__slack_users_unique").on(table.slackUserId, table.teamId),
		index("users__slack_users_user_idx").on(table.userId),
		index("users__slack_users_org_idx").on(table.organizationId),
	],
);

export type InsertUsersSlackUsers = typeof usersSlackUsers.$inferInsert;
export type SelectUsersSlackUsers = typeof usersSlackUsers.$inferSelect;

export const workspaceType = pgEnum("workspace_type", workspaceTypeValues);

export const projects = pgTable(
	"projects",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		name: text().notNull(),
		slug: text().notNull(),
		githubRepositoryId: uuid("github_repository_id").references(
			() => githubRepositories.id,
			{ onDelete: "set null" },
		),
		repoOwner: text("repo_owner").notNull(),
		repoName: text("repo_name").notNull(),
		repoUrl: text("repo_url").notNull(),
		defaultBranch: text("default_branch").notNull().default("main"),
		createdAt: timestamp("created_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at")
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		index("projects_organization_id_idx").on(table.organizationId),
		unique("projects_org_slug_unique").on(table.organizationId, table.slug),
	],
);

export type InsertProject = typeof projects.$inferInsert;
export type SelectProject = typeof projects.$inferSelect;

export const secrets = pgTable(
	"secrets",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		projectId: uuid("project_id")
			.notNull()
			.references(() => projects.id, { onDelete: "cascade" }),
		key: text().notNull(),
		encryptedValue: text("encrypted_value").notNull(),
		sensitive: boolean().notNull().default(false),
		createdByUserId: uuid("created_by_user_id").references(() => users.id, {
			onDelete: "set null",
		}),
		createdAt: timestamp("created_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at")
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		unique("secrets_project_key_unique").on(table.projectId, table.key),
		index("secrets_project_id_idx").on(table.projectId),
		index("secrets_organization_id_idx").on(table.organizationId),
	],
);

export type InsertSecret = typeof secrets.$inferInsert;
export type SelectSecret = typeof secrets.$inferSelect;

export const sandboxImages = pgTable(
	"sandbox_images",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		projectId: uuid("project_id")
			.notNull()
			.references(() => projects.id, { onDelete: "cascade" }),
		setupCommands: jsonb("setup_commands").$type<string[]>().default([]),
		baseImage: text("base_image"),
		systemPackages: jsonb("system_packages").$type<string[]>().default([]),
		createdAt: timestamp("created_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at")
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		unique("sandbox_images_project_unique").on(table.projectId),
		index("sandbox_images_organization_id_idx").on(table.organizationId),
	],
);

export type InsertSandboxImage = typeof sandboxImages.$inferInsert;
export type SelectSandboxImage = typeof sandboxImages.$inferSelect;

export const workspaces = pgTable(
	"workspaces",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		projectId: uuid("project_id")
			.notNull()
			.references(() => projects.id, { onDelete: "cascade" }),
		name: text().notNull(),
		type: workspaceType().notNull(),
		config: jsonb().notNull().$type<WorkspaceConfig>(),
		createdByUserId: uuid("created_by_user_id").references(() => users.id, {
			onDelete: "set null",
		}),
		createdAt: timestamp("created_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at")
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		index("workspaces_project_id_idx").on(table.projectId),
		index("workspaces_organization_id_idx").on(table.organizationId),
		index("workspaces_type_idx").on(table.type),
	],
);

export type InsertWorkspace = typeof workspaces.$inferInsert;
export type SelectWorkspace = typeof workspaces.$inferSelect;

export const chatSessions = pgTable(
	"chat_sessions",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		createdBy: uuid("created_by")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		workspaceId: uuid("workspace_id").references(() => workspaces.id, {
			onDelete: "set null",
		}),
		title: text(),
		lastActiveAt: timestamp("last_active_at").notNull().defaultNow(),
		createdAt: timestamp("created_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at")
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		index("chat_sessions_org_idx").on(table.organizationId),
		index("chat_sessions_created_by_idx").on(table.createdBy),
		index("chat_sessions_last_active_idx").on(table.lastActiveAt),
	],
);

export type InsertChatSession = typeof chatSessions.$inferInsert;
export type SelectChatSession = typeof chatSessions.$inferSelect;

export const sessionHosts = pgTable(
	"session_hosts",
	{
		id: uuid().primaryKey().defaultRandom(),
		sessionId: uuid("session_id")
			.notNull()
			.references(() => chatSessions.id, { onDelete: "cascade" }),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		deviceId: text("device_id").notNull(),
		createdAt: timestamp("created_at").notNull().defaultNow(),
	},
	(table) => [
		index("session_hosts_session_id_idx").on(table.sessionId),
		index("session_hosts_org_idx").on(table.organizationId),
		index("session_hosts_device_id_idx").on(table.deviceId),
	],
);

export type InsertSessionHost = typeof sessionHosts.$inferInsert;
export type SelectSessionHost = typeof sessionHosts.$inferSelect;
