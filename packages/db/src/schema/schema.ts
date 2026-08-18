import { sql } from "drizzle-orm";
import {
	boolean,
	check,
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
	automationPromptSourceValues,
	automationRunStatusValues,
	automationSessionKindValues,
	automationTriggerKindValues,
	cloudWorkspaceStatusValues,
	commandStatusValues,
	desktopNoticeCtaActionValues,
	desktopNoticeSeverityValues,
	desktopNoticeTriggerValues,
	integrationProviderValues,
	taskPriorityValues,
	taskStatusEnumValues,
	v2ClientTypeValues,
	v2UsersHostRoleValues,
	v2WorkspaceTypeValues,
	workspaceTypeValues,
} from "./enums";
import { githubRepositories } from "./github";
import type {
	IntegrationConfig,
	TriggerConfig,
	UserIdentityMetadata,
} from "./types";
import type { WorkspaceConfig } from "./zod";

export const taskStatus = pgEnum("task_status", taskStatusEnumValues);
export const taskPriority = pgEnum("task_priority", taskPriorityValues);
export const integrationProvider = pgEnum(
	"integration_provider",
	integrationProviderValues,
);
export const commandStatus = pgEnum("command_status", commandStatusValues);
export const cloudWorkspaceStatus = pgEnum(
	"cloud_workspace_status",
	cloudWorkspaceStatusValues,
);
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

		// External project/cycle snapshot (from Linear)
		externalProjectId: text("external_project_id"),
		externalProjectName: text("external_project_name"),
		externalCycleId: text("external_cycle_id"),
		externalCycleName: text("external_cycle_name"),

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
		index("tasks_external_project_id_idx").on(table.externalProjectId),
		index("tasks_external_project_name_idx").on(table.externalProjectName),
		index("tasks_external_cycle_id_idx").on(table.externalCycleId),
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

		disconnectedAt: timestamp("disconnected_at"),
		disconnectReason: text("disconnect_reason"),

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
		// One connection per organization for org-scoped providers (Linear,
		// Slack, ...). Google is the exception: Calendar and Gmail are one
		// person's, so each member connects their own account. Two partial
		// indexes rather than one constraint, and callers name the predicate in
		// their ON CONFLICT target so Postgres can infer the right one.
		//
		// The predicate names the enum literal 'google', which 0083 added. Postgres
		// refuses to USE a new enum value in the same transaction that added it,
		// and drizzle runs every pending migration in one transaction — so 0083
		// must be committed before 0084 runs. It is: 0083 merged to main and
		// deploys ahead of this. A DB that skipped 0083 (a stale preview branch)
		// must apply it first; do not "fix" that by casting to text — enum::text
		// is not IMMUTABLE and cannot sit in an index predicate.
		uniqueIndex("integration_connections_org_provider_unique")
			.on(table.organizationId, table.provider)
			.where(sql`${table.provider} <> 'google'`),
		uniqueIndex("integration_connections_google_user_unique")
			.on(table.organizationId, table.provider, table.connectedByUserId)
			.where(sql`${table.provider} = 'google'`),
		uniqueIndex("integration_connections_slack_external_org_active_unique")
			.on(table.externalOrgId)
			.where(
				sql`${table.provider} = 'slack' AND ${table.disconnectedAt} IS NULL`,
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
		billingInterval: text("billing_interval"),
		stripeScheduleId: text("stripe_schedule_id"),
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

/**
 * A person's identity at an external provider, per organization.
 *
 * Org-scoped rather than global, matching how Linear handles it: connecting
 * GitHub in one workspace leaves another workspace untouched, and the same
 * account can be connected in both. Verified by experiment — their docs claim
 * one workspace per account, and the product does not enforce it.
 *
 * Not one table per provider. `users__slack_users` predates this and is the
 * shape being replaced.
 */
export const userIdentities = pgTable(
	"user_identities",
	{
		id: uuid().primaryKey().defaultRandom(),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),

		// Text rather than integration_provider: this also holds sign-in providers
		// like google, which have no connection row behind them.
		provider: text().notNull(),
		// The provider's stable id. Matching keys off this because a handle can be
		// renamed and an id cannot.
		externalId: text("external_id").notNull(),
		// The workspace, tenant or account the id belongs to, for providers whose
		// user ids are not global. Null for GitHub and Google, set for Slack,
		// Linear, Teams and PagerDuty.
		externalScopeId: text("external_scope_id"),

		// Display only, and nullable: an OAuth sign-in yields the id without the
		// handle ever being fetched.
		handle: text(),
		displayName: text("display_name"),

		// Provider-specific extras, typed as a union per provider rather than a
		// free blob. Slack's chosen model lives here; it is the only occupant.
		metadata: jsonb().$type<UserIdentityMetadata>(),

		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(t) => [
		// One external account per org. NULLS NOT DISTINCT so providers with a
		// null scope still collide with themselves.
		unique("user_identities_account_unique")
			.on(t.organizationId, t.provider, t.externalScopeId, t.externalId)
			.nullsNotDistinct(),
		// Deliberately no constraint limiting a person to one account per
		// provider: linking both a work and a personal account is supported.
		index("user_identities_user_idx").on(t.userId),
		index("user_identities_org_provider_idx").on(t.organizationId, t.provider),
	],
);

export type InsertUserIdentity = typeof userIdentities.$inferInsert;
export type SelectUserIdentity = typeof userIdentities.$inferSelect;

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
		iconUrl: text("icon_url"),
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

/**
 * Deliberately not a `v2_hosts` row: a sandbox is 1:1 with a workspace rather
 * than a machine hosting many, and registering one would both put it in the
 * device picker and require an outbound relay socket, which fights the
 * provider's wake-on-inbound sleep. Clients reach it directly at `sandbox_url`
 * with a token brokered by the cloud.
 */
export const cloudWorkspaces = pgTable(
	"cloud_workspaces",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		projectId: uuid("project_id")
			.notNull()
			.references(() => v2Projects.id, { onDelete: "cascade" }),
		// Creation inputs, not the workspace's identity: the sandbox's own
		// host.db owns the workspace row (name, branch) once it is seeded, the
		// same way every other host does. Read these to provision a sandbox,
		// never to display one — a rename lands on the sandbox and leaves these
		// behind.
		name: text().notNull(),
		branch: text().notNull(),
		provider: text().notNull().default("blaxel"),
		providerSandboxId: text("provider_sandbox_id").notNull(),
		sandboxUrl: text("sandbox_url"),
		status: cloudWorkspaceStatus().notNull().default("provisioning"),
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
		index("cloud_workspaces_organization_id_idx").on(table.organizationId),
		index("cloud_workspaces_project_id_idx").on(table.projectId),
		unique("cloud_workspaces_provider_sandbox_id_unique").on(
			table.provider,
			table.providerSandboxId,
		),
	],
);

export type InsertCloudWorkspace = typeof cloudWorkspaces.$inferInsert;
export type SelectCloudWorkspace = typeof cloudWorkspaces.$inferSelect;

export const v2Hosts = pgTable(
	"v2_hosts",
	{
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		machineId: text("machine_id").notNull(),
		name: text().notNull(),
		isOnline: boolean("is_online").notNull().default(false),
		// User-defined command run locally to wake/start this host (e.g. resume a
		// cloud sandbox, start a VM). Null when the host has no wake command.
		wakeCommand: text("wake_command"),
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
		// FK dropped ahead of the v2_projects table removal; the column stays
		// as a bare uuid, same shape as automations.v2_project_id (0062).
		projectId: uuid("project_id").notNull(),
		hostId: text("host_id").notNull(),
		name: text().notNull(),
		branch: text().notNull(),
		type: v2WorkspaceType().notNull().default("worktree"),
		createdByUserId: uuid("created_by_user_id").references(() => users.id, {
			onDelete: "set null",
		}),
		taskId: uuid("task_id").references(() => tasks.id, {
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
		}).onDelete("cascade"),
		index("v2_workspaces_project_id_idx").on(table.projectId),
		index("v2_workspaces_organization_id_idx").on(table.organizationId),
		index("v2_workspaces_host_id_idx").on(table.hostId),
		index("v2_workspaces_task_id_idx").on(table.taskId),
		uniqueIndex("v2_workspaces_one_main_per_host")
			.on(table.projectId, table.hostId)
			.where(sql`${table.type} = 'main'`),
	],
);

export type InsertV2Workspace = typeof v2Workspaces.$inferInsert;
export type SelectV2Workspace = typeof v2Workspaces.$inferSelect;

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
		v2WorkspaceId: uuid("v2_workspace_id"),
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

export const chatAttachments = pgTable(
	"chat_attachments",
	{
		id: uuid().primaryKey().defaultRandom(),
		chatSessionId: uuid("chat_session_id")
			.notNull()
			.references(() => chatSessions.id, { onDelete: "cascade" }),
		createdBy: uuid("created_by")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		blobPathname: text("blob_pathname").notNull(),
		mediaType: text("media_type").notNull(),
		filename: text().notNull(),
		sizeBytes: integer("size_bytes").notNull(),
		createdAt: timestamp("created_at").notNull().defaultNow(),
	},
	(table) => [
		index("chat_attachments_session_idx").on(table.chatSessionId),
		index("chat_attachments_created_by_idx").on(table.createdBy),
	],
);

export type InsertChatAttachment = typeof chatAttachments.$inferInsert;
export type SelectChatAttachment = typeof chatAttachments.$inferSelect;

export const automationRunStatus = pgEnum(
	"automation_run_status",
	automationRunStatusValues,
);

export const automationSessionKind = pgEnum(
	"automation_session_kind",
	automationSessionKindValues,
);
export const automationPromptSource = pgEnum(
	"automation_prompt_source",
	automationPromptSourceValues,
);

export const automationTriggerKind = pgEnum(
	"automation_trigger_kind",
	automationTriggerKindValues,
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

		agent: text("agent").notNull(),

		targetHostId: text("target_host_id"),

		// Null = session automation: each run creates a project-less session
		// workspace (or the pinned v2WorkspaceId is itself a session).
		v2ProjectId: uuid("v2_project_id"),
		v2WorkspaceId: uuid("v2_workspace_id"),

		// The schedule lives in the automation's `schedule` trigger.
		enabled: boolean().notNull().default(true),

		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(t) => [
		// No dispatcher index here — the dispatcher scans automation_triggers.
		// Target for automation_triggers' composite FK.
		unique("automations_id_org_unique").on(t.id, t.organizationId),
		index("automations_owner_idx").on(t.ownerUserId),
		index("automations_organization_idx").on(t.organizationId),
	],
);

export type InsertAutomation = typeof automations.$inferInsert;
export type SelectAutomation = typeof automations.$inferSelect;

export const automationTriggers = pgTable(
	"automation_triggers",
	{
		id: uuid().primaryKey().defaultRandom(),
		automationId: uuid("automation_id").notNull(),
		// Denormalized so the matcher never joins to find candidates.
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),

		kind: automationTriggerKind().notNull(),
		config: jsonb().$type<TriggerConfig>().notNull(),
		enabled: boolean().notNull().default(true),

		// Schedule kind only. A column rather than config because the dispatcher
		// indexes and sorts on it.
		nextRunAt: timestamp("next_run_at", { withTimezone: true }),

		// Bearer kinds store a SHA-256 hash of the token; HMAC kinds store the
		// raw signing secret. Never returned by the API.
		secretHash: text("secret_hash"),
		secretPrefix: text("secret_prefix"),
		secretRotatedAt: timestamp("secret_rotated_at", { withTimezone: true }),

		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(t) => [
		// Composite, so a trigger cannot name an automation in another org.
		foreignKey({
			columns: [t.automationId, t.organizationId],
			foreignColumns: [automations.id, automations.organizationId],
			name: "automation_triggers_automation_org_fk",
		}).onDelete("cascade"),
		check(
			"automation_triggers_kind_matches_config",
			sql`config->>'kind' = kind::text`,
		),
		index("automation_triggers_dispatcher_idx")
			.on(t.enabled, t.nextRunAt)
			.where(sql`kind = 'schedule'`),
		index("automation_triggers_matcher_idx")
			.on(t.organizationId, t.kind)
			.where(sql`enabled`),
		index("automation_triggers_automation_idx").on(t.automationId),
		// Deliberately not unique on (automation_id) where kind = 'schedule'. An
		// automation may carry several schedules — "every weekday at 9" and "on
		// Sunday at 6" is one automation, not two. The dispatcher already selects
		// trigger rows rather than automations and gates on automations.enabled,
		// so each schedule advances its own next_run_at independently.
		index("automation_triggers_schedule_idx")
			.on(t.automationId)
			.where(sql`kind = 'schedule'`),
	],
);

export type InsertAutomationTrigger = typeof automationTriggers.$inferInsert;
export type SelectAutomationTrigger = typeof automationTriggers.$inferSelect;

export const automationEvents = pgTable(
	"automation_events",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),

		// Text, not integration_provider: this must hold "webhook" and
		// "superset", which have no connection behind them.
		// Which connection produced this. Null for webhook and superset events.
		// Not backfillable later: provider payloads do not always name it.
		integrationConnectionId: uuid("integration_connection_id").references(
			() => integrationConnections.id,
			{ onDelete: "set null" },
		),

		provider: text().notNull(),
		eventType: text("event_type").notNull(),
		externalEventId: text("external_event_id").notNull(),

		resourceKey: text("resource_key"),

		title: text().notNull(),
		url: text(),
		repositoryId: text("repository_id"),
		ref: text(),
		actorLogin: text("actor_login"),
		actorIsExternal: boolean("actor_is_external"),

		// Its own copy: ingest is prunable and the prompt needs this at dispatch.
		payload: jsonb().notNull(),

		// Provenance pointer, deliberately not a foreign key, so ingest stays
		// prunable. Null for webhook and superset events.
		webhookEventId: uuid("webhook_event_id"),

		receivedAt: timestamp("received_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		// Connection-scoped: two orgs can legitimately receive the same
		// external id, and a customer-chosen Idempotency-Key certainly can.
		unique("automation_events_dedup_unique")
			.on(t.integrationConnectionId, t.provider, t.externalEventId)
			.nullsNotDistinct(),
		index("automation_events_org_received_idx").on(
			t.organizationId,
			t.receivedAt,
		),
		index("automation_events_resource_idx").on(t.resourceKey),
	],
);

export type InsertAutomationEvent = typeof automationEvents.$inferInsert;
export type SelectAutomationEvent = typeof automationEvents.$inferSelect;

export const automationRuns = pgTable(
	"automation_runs",
	{
		id: uuid().primaryKey().defaultRandom(),
		automationId: uuid("automation_id").notNull(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),

		title: text().notNull(),

		triggerId: uuid("trigger_id").references(() => automationTriggers.id, {
			onDelete: "set null",
		}),
		eventId: uuid("event_id").references(() => automationEvents.id, {
			onDelete: "set null",
		}),

		// Nullable now: schedule runs keep it, event runs have no schedule.
		scheduledFor: timestamp("scheduled_for", { withTimezone: true }),

		// Denormalized from the event so the debounce index stays local.
		resourceKey: text("resource_key"),

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
		// Composite, so a run cannot name an automation in another org.
		foreignKey({
			columns: [t.automationId, t.organizationId],
			foreignColumns: [automations.id, automations.organizationId],
			name: "automation_runs_automation_org_fk",
		}).onDelete("cascade"),
		// Replaces automation_runs_dedup_idx, which was UNIQUE(automation_id,
		// scheduled_for) and stops deduping the moment scheduled_for is nullable.
		uniqueIndex("automation_runs_schedule_dedup_idx")
			.on(t.automationId, t.scheduledFor)
			.where(sql`scheduled_for IS NOT NULL`),
		uniqueIndex("automation_runs_event_dedup_idx")
			.on(t.triggerId, t.eventId)
			.where(sql`event_id IS NOT NULL`),
		index("automation_runs_inflight_resource_idx")
			.on(t.triggerId, t.resourceKey)
			.where(sql`status IN ('dispatching', 'dispatched')`),
		index("automation_runs_history_idx").on(t.automationId, t.createdAt),
		index("automation_runs_status_idx").on(t.status),
		index("automation_runs_workspace_idx").on(t.v2WorkspaceId),
	],
);

export type InsertAutomationRun = typeof automationRuns.$inferInsert;
export type SelectAutomationRun = typeof automationRuns.$inferSelect;

export const automationPromptVersions = pgTable(
	"automation_prompt_versions",
	{
		id: uuid().primaryKey().defaultRandom(),
		automationId: uuid("automation_id")
			.notNull()
			.references(() => automations.id, { onDelete: "cascade" }),
		authorUserId: uuid("author_user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		windowBucket: integer("window_bucket").notNull(),

		content: text().notNull(),
		contentHash: text("content_hash").notNull(),
		source: automationPromptSource().notNull(),
		restoredFromVersionId: uuid("restored_from_version_id"),

		startedAt: timestamp("started_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(t) => [
		uniqueIndex("automation_prompt_versions_bucket_uniq")
			.on(t.automationId, t.authorUserId, t.windowBucket)
			.where(sql`${t.source} <> 'restore'`),
		index("automation_prompt_versions_automation_idx").on(
			t.automationId,
			t.updatedAt,
		),
		foreignKey({
			columns: [t.restoredFromVersionId],
			foreignColumns: [t.id],
			name: "automation_prompt_versions_restored_from_version_id_fk",
		}).onDelete("set null"),
	],
);

export type InsertAutomationPromptVersion =
	typeof automationPromptVersions.$inferInsert;
export type SelectAutomationPromptVersion =
	typeof automationPromptVersions.$inferSelect;

export const submittedPrompts = pgTable(
	"submitted_prompts",
	{
		id: uuid().primaryKey().defaultRandom(),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		organizationId: uuid("organization_id").references(() => organizations.id, {
			onDelete: "set null",
		}),
		promptText: text("prompt_text").notNull(),
		submitterName: text("submitter_name"),
		createdAt: timestamp("created_at").notNull().defaultNow(),
	},
	(table) => [
		index("submitted_prompts_user_id_idx").on(table.userId),
		index("submitted_prompts_organization_id_idx").on(table.organizationId),
		index("submitted_prompts_created_at_idx").on(table.createdAt),
	],
);

export type InsertSubmittedPrompt = typeof submittedPrompts.$inferInsert;
export type SelectSubmittedPrompt = typeof submittedPrompts.$inferSelect;

export const desktopNoticeSeverity = pgEnum(
	"desktop_notice_severity",
	desktopNoticeSeverityValues,
);
export const desktopNoticeTrigger = pgEnum(
	"desktop_notice_trigger",
	desktopNoticeTriggerValues,
);
export const desktopNoticeCtaAction = pgEnum(
	"desktop_notice_cta_action",
	desktopNoticeCtaActionValues,
);

export const desktopNotices = pgTable(
	"desktop_notices",
	{
		id: uuid().primaryKey().defaultRandom(),
		severity: desktopNoticeSeverity().notNull(),
		trigger: desktopNoticeTrigger().notNull().default("immediate"),
		// targeting: null = applies to all
		minVersion: text("min_version"),
		maxVersion: text("max_version"),
		platforms: text().array(),
		channels: text().array(),
		startsAt: timestamp("starts_at", { withTimezone: true }),
		endsAt: timestamp("ends_at", { withTimezone: true }),
		// presentation: markdown body is the whole rendered content
		body: text().notNull(),
		ctaLabel: text("cta_label"),
		ctaAction: desktopNoticeCtaAction("cta_action"),
		ctaUrl: text("cta_url"),
		dismissible: boolean().notNull().default(true),
		active: boolean().notNull().default(false),
		createdAt: timestamp("created_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at")
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(table) => [index("desktop_notices_active_idx").on(table.active)],
);

export type InsertDesktopNotice = typeof desktopNotices.$inferInsert;
export type SelectDesktopNotice = typeof desktopNotices.$inferSelect;
