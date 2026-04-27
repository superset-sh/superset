import type { ResolvedAgentConfig } from "@superset/shared/agent-settings";
import { sql } from "drizzle-orm";
import {
	boolean,
	foreignKey,
	index,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	primaryKey,
	real,
	text,
	timestamp,
	unique,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { organizations, users } from "./auth";
import {
	automationRunStatusValues,
	automationSessionKindValues,
	commandStatusValues,
	deviceTypeValues,
	integrationProviderValues,
	taskPriorityValues,
	taskStatusEnumValues,
	v2ClientTypeValues,
	v2UsersHostRoleValues,
	v2WorkspaceTypeValues,
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
export const v2ClientType = pgEnum("v2_client_type", v2ClientTypeValues);
export const v2UsersHostRole = pgEnum(
	"v2_users_host_role",
	v2UsersHostRoleValues,
);
export const v2WorkspaceType = pgEnum(
	"v2_workspace_type",
	v2WorkspaceTypeValues,
);

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

		// External assignee snapshot (for unmatched Linear users)
		assigneeExternalId: text("assignee_external_id"),
		assigneeDisplayName: text("assignee_display_name"),
		assigneeAvatarUrl: text("assignee_avatar_url"),

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
		index("tasks_assignee_external_id_idx").on(table.assigneeExternalId),
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

// Device presence — v1 concept. Tracks per-(user, machine) presence for
// MCP ownership verification. Untouched by the v2 host consolidation; will
// be retired when v1 is removed.
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

export const v2Projects = pgTable(
	"v2_projects",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		name: text().notNull(),
		slug: text().notNull(),
		repoCloneUrl: text("repo_clone_url"),
		githubRepositoryId: uuid("github_repository_id").references(
			() => githubRepositories.id,
			{ onDelete: "set null" },
		),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		index("v2_projects_organization_id_idx").on(table.organizationId),
		unique("v2_projects_org_slug_unique").on(table.organizationId, table.slug),
	],
);

export type InsertV2Project = typeof v2Projects.$inferInsert;
export type SelectV2Project = typeof v2Projects.$inferSelect;

export const v2Hosts = pgTable(
	"v2_hosts",
	{
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		machineId: text("machine_id").notNull(),
		name: text().notNull(),
		isOnline: boolean("is_online").notNull().default(false),
		createdByUserId: uuid("created_by_user_id").references(() => users.id, {
			onDelete: "set null",
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
		primaryKey({ columns: [table.organizationId, table.machineId] }),
		index("v2_hosts_organization_id_idx").on(table.organizationId),
	],
);

export type InsertV2Host = typeof v2Hosts.$inferInsert;
export type SelectV2Host = typeof v2Hosts.$inferSelect;

export const v2Clients = pgTable(
	"v2_clients",
	{
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		machineId: text("machine_id").notNull(),
		type: v2ClientType().notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		primaryKey({
			columns: [table.organizationId, table.userId, table.machineId],
		}),
		index("v2_clients_organization_id_idx").on(table.organizationId),
		index("v2_clients_user_id_idx").on(table.userId),
	],
);

export type InsertV2Client = typeof v2Clients.$inferInsert;
export type SelectV2Client = typeof v2Clients.$inferSelect;

export const v2UsersHosts = pgTable(
	"v2_users_hosts",
	{
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		hostId: text("host_id").notNull(),
		role: v2UsersHostRole().notNull().default("member"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		primaryKey({
			columns: [table.organizationId, table.userId, table.hostId],
		}),
		foreignKey({
			columns: [table.organizationId, table.hostId],
			foreignColumns: [v2Hosts.organizationId, v2Hosts.machineId],
			name: "v2_users_hosts_host_fk",
		}).onDelete("cascade"),
		index("v2_users_hosts_organization_id_idx").on(table.organizationId),
		index("v2_users_hosts_user_id_idx").on(table.userId),
		index("v2_users_hosts_host_id_idx").on(table.hostId),
	],
);

export type InsertV2UsersHosts = typeof v2UsersHosts.$inferInsert;
export type SelectV2UsersHosts = typeof v2UsersHosts.$inferSelect;

export const v2Workspaces = pgTable(
	"v2_workspaces",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		projectId: uuid("project_id")
			.notNull()
			.references(() => v2Projects.id, { onDelete: "cascade" }),
		hostId: text("host_id").notNull(),
		name: text().notNull(),
		branch: text().notNull(),
		type: v2WorkspaceType().notNull().default("worktree"),
		createdByUserId: uuid("created_by_user_id").references(() => users.id, {
			onDelete: "set null",
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
		foreignKey({
			columns: [table.organizationId, table.hostId],
			foreignColumns: [v2Hosts.organizationId, v2Hosts.machineId],
			name: "v2_workspaces_host_fk",
		}),
		index("v2_workspaces_project_id_idx").on(table.projectId),
		index("v2_workspaces_organization_id_idx").on(table.organizationId),
		index("v2_workspaces_host_id_idx").on(table.hostId),
		uniqueIndex("v2_workspaces_one_main_per_host")
			.on(table.projectId, table.hostId)
			.where(sql`${table.type} = 'main'`),
	],
);

export type InsertV2Workspace = typeof v2Workspaces.$inferInsert;
export type SelectV2Workspace = typeof v2Workspaces.$inferSelect;

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
		v2WorkspaceId: uuid("v2_workspace_id").references(() => v2Workspaces.id, {
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

export const automationRunStatus = pgEnum(
	"automation_run_status",
	automationRunStatusValues,
);

export const automationSessionKind = pgEnum(
	"automation_session_kind",
	automationSessionKindValues,
);

export const automations = pgTable(
	"automations",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		ownerUserId: uuid("owner_user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),

		name: text().notNull(),
		prompt: text().notNull(),

		agentConfig: jsonb("agent_config").$type<ResolvedAgentConfig>().notNull(),

		targetHostId: text("target_host_id"),

		v2ProjectId: uuid("v2_project_id")
			.notNull()
			.references(() => v2Projects.id, { onDelete: "cascade" }),
		v2WorkspaceId: uuid("v2_workspace_id"),

		rrule: text().notNull(),
		dtstart: timestamp("dtstart", { withTimezone: true }).notNull(),
		timezone: text().notNull(),

		enabled: boolean().notNull().default(true),

		mcpScope: jsonb("mcp_scope").$type<string[]>().notNull().default([]),

		nextRunAt: timestamp("next_run_at", { withTimezone: true }).notNull(),

		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(t) => [
		index("automations_dispatcher_idx").on(t.enabled, t.nextRunAt),
		index("automations_owner_idx").on(t.ownerUserId),
		index("automations_organization_idx").on(t.organizationId),
	],
);

export type InsertAutomation = typeof automations.$inferInsert;
export type SelectAutomation = typeof automations.$inferSelect;

export const automationRuns = pgTable(
	"automation_runs",
	{
		id: uuid().primaryKey().defaultRandom(),
		automationId: uuid("automation_id")
			.notNull()
			.references(() => automations.id, { onDelete: "cascade" }),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),

		title: text().notNull(),

		scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),

		hostId: text("host_id"),
		v2WorkspaceId: uuid("v2_workspace_id"),

		sessionKind: automationSessionKind("session_kind"),
		chatSessionId: uuid("chat_session_id").references(() => chatSessions.id, {
			onDelete: "set null",
		}),
		terminalSessionId: text("terminal_session_id"),

		status: automationRunStatus().notNull(),
		error: text(),
		dispatchedAt: timestamp("dispatched_at", { withTimezone: true }),

		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		uniqueIndex("automation_runs_dedup_idx").on(t.automationId, t.scheduledFor),
		index("automation_runs_history_idx").on(t.automationId, t.createdAt),
		index("automation_runs_status_idx").on(t.status),
		index("automation_runs_workspace_idx").on(t.v2WorkspaceId),
	],
);

export type InsertAutomationRun = typeof automationRuns.$inferInsert;
export type SelectAutomationRun = typeof automationRuns.$inferSelect;
